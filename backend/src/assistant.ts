import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Role, SlotStatus } from '@prisma/client';
import { prisma } from './prisma';
import { config } from './config';
import { requireAuth, requireRole } from './middleware';
import { rateLimit } from './rateLimit';
import { appointmentReference, currentVisitFees, inactiveOfficeIds, patientConsultationPrices } from './routes';
import { consultationLabelText } from './assistantFormat';
import { ASSISTANT_RULES, PLATFORM_GUIDE } from './assistantGuide';

/**
 * Patient assistant (phase 1): answers questions about HappyPatient with Groq (OpenAI-compatible chat API).
 * The model reads clinic data only through the tools below, each run with the signed-in patient's own access.
 * It never books: propose_booking returns a card that the patient confirms in the app.
 * Conversation text is not stored or logged; only token counts are logged.
 */
export const assistantRouter = Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TOOL_ROUNDS = 5;
const HISTORY_MESSAGES = 10;
const TZ = 'Asia/Almaty';
const when = (date: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(date);
const today = () => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date());

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type BookingCard = { slotId: string; doctorId: string; doctorName: string; specialty: string; office: string | null; startAt: string; endAt: string; channel: 'in-person' | 'online'; visitKind: 'first' | 'follow-up'; priceKzt: number; visitPurpose: string };

export class AssistantBusyError extends Error {}

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1500) })).min(1).max(40),
});

/** One chat completion. Exported for tests; the API key never leaves this process. */
export async function callGroq(messages: ChatMessage[], tools: unknown[]) {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.GROQ_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
      max_completion_tokens: 800,
      // gpt-oss models think before answering; low effort keeps replies quick and inside the free token limit.
      ...(config.GROQ_MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
  });
  if (response.status === 429) throw new AssistantBusyError();
  if (!response.ok) throw new Error(`Groq request failed with ${response.status}`);
  return (await response.json()) as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>; usage?: { total_tokens?: number } };
}

async function toolDefinitions() {
  const specialties = (await prisma.category.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: 'asc' } })).map((item) => item.name);
  const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });
  return [
    fn('search_doctors', 'Find doctors by specialty, name or city. Returns up to 5 with price and next free time.', {
      specialty: { type: 'string', enum: specialties, description: 'Specialty in English, from the list.' },
      name: { type: 'string', description: 'Part of the doctor\'s name.' },
      city: { type: 'string' },
    }),
    fn('get_free_slots', 'Free appointment times of one doctor, from a date (default: now).', {
      doctorId: { type: 'string' },
      date: { type: 'string', description: 'YYYY-MM-DD in Almaty time.' },
    }, ['doctorId']),
    fn('get_my_prices', 'What this patient pays with a doctor now, in person and online (first or follow-up visit).', { doctorId: { type: 'string' } }, ['doctorId']),
    fn('get_my_appointments', 'The patient\'s upcoming visits and the last few past ones.', {}),
    fn('propose_booking', 'Show the patient a booking card with a Confirm button. Does not book.', {
      slotId: { type: 'string' },
      channel: { type: 'string', enum: ['in-person', 'online'] },
      visitPurpose: { type: 'string', description: 'Short reason for the visit, in the patient\'s words.' },
    }, ['slotId', 'channel', 'visitPurpose']),
  ];
}

/** Runs one tool for the signed-in patient. Results are compact JSON so the free token limit lasts. */
async function runTool(name: string, args: Record<string, unknown>, patientId: string, cards: BookingCard[]): Promise<unknown> {
  const now = new Date();
  const text = (value: unknown, max = 100) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  if (name === 'search_doctors') {
    const specialty = text(args.specialty); const doctorName = text(args.name); const city = text(args.city);
    const inactive = await inactiveOfficeIds();
    const doctors = await prisma.doctor.findMany({
      where: {
        category: { active: true, ...(specialty ? { name: { equals: specialty, mode: 'insensitive' } } : {}) },
        ...(doctorName ? { user: { OR: doctorName.split(/\s+/).flatMap((part) => [{ firstName: { contains: part, mode: 'insensitive' as const } }, { lastName: { contains: part, mode: 'insensitive' as const } }]) } } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        OR: [{ locationId: null }, { locationId: { notIn: inactive } }],
      },
      select: { id: true, categoryId: true, consultationFee: true, city: true, office: true, officeNumber: true, category: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
      take: 5,
      orderBy: { user: { lastName: 'asc' } },
    });
    const fees = await currentVisitFees(doctors, now);
    return Promise.all(doctors.map(async (doctor) => {
      const next = await prisma.scheduleSlot.findFirst({ where: { doctorId: doctor.id, status: SlotStatus.FREE, startAt: { gt: now } }, orderBy: { startAt: 'asc' }, select: { id: true, startAt: true } });
      return { doctorId: doctor.id, name: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`, specialty: doctor.category.name, place: [doctor.city, doctor.officeNumber ?? doctor.office].filter(Boolean).join(', ') || null, firstVisitPriceKzt: fees.get(doctor.id) ?? doctor.consultationFee, nextFree: next ? { slotId: next.id, time: when(next.startAt) } : null };
    }));
  }
  if (name === 'get_free_slots') {
    const doctorId = text(args.doctorId); const date = text(args.date, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(Math.max(Date.parse(`${date}T00:00:00+05:00`), now.getTime())) : now;
    const slots = await prisma.scheduleSlot.findMany({ where: { doctorId, status: SlotStatus.FREE, startAt: { gt: from } }, orderBy: { startAt: 'asc' }, take: 8, select: { id: true, startAt: true } });
    return slots.length ? slots.map((slot) => ({ slotId: slot.id, time: when(slot.startAt) })) : { message: 'No free times from this date.' };
  }
  if (name === 'get_my_prices') {
    const doctor = await prisma.doctor.findUnique({ where: { id: text(args.doctorId) }, select: { id: true, categoryId: true, consultationFee: true } });
    if (!doctor) return { error: 'Doctor not found.' };
    const result = await patientConsultationPrices(patientId, doctor);
    return { visitKind: result.visitKind, inPersonKzt: result.prices['in-person'], onlineKzt: result.prices.online };
  }
  if (name === 'get_my_appointments') {
    const select = { id: true, startAt: true, status: true, consultationType: true, doctor: { select: { category: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } } } as const;
    const [upcoming, past] = await Promise.all([
      prisma.scheduleSlot.findMany({ where: { patientId, status: { in: [SlotStatus.BOOKED, SlotStatus.OCCUPIED] }, endAt: { gt: now } }, orderBy: { startAt: 'asc' }, take: 5, select }),
      prisma.scheduleSlot.findMany({ where: { patientId, status: SlotStatus.OCCUPIED, endAt: { lte: now } }, orderBy: { startAt: 'desc' }, take: 3, select }),
    ]);
    const view = (slot: typeof upcoming[number]) => ({ reference: appointmentReference(slot.id), doctor: `Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`, specialty: slot.doctor.category.name, time: when(slot.startAt), status: slot.status === SlotStatus.OCCUPIED ? 'checked in' : 'booked', consultation: consultationLabelText(slot.consultationType) });
    return { upcoming: upcoming.map(view), recentPast: past.map(view) };
  }
  if (name === 'propose_booking') {
    const channel = args.channel === 'online' ? 'online' : 'in-person';
    const slot = await prisma.scheduleSlot.findFirst({ where: { id: text(args.slotId), status: SlotStatus.FREE, startAt: { gt: now } }, select: { id: true, startAt: true, endAt: true, doctor: { select: { id: true, categoryId: true, consultationFee: true, office: true, officeNumber: true, category: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } } } });
    if (!slot) return { error: 'That time is not free any more. Look up free times again.' };
    const prices = await patientConsultationPrices(patientId, slot.doctor);
    const card: BookingCard = { slotId: slot.id, doctorId: slot.doctor.id, doctorName: `Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`, specialty: slot.doctor.category.name, office: slot.doctor.officeNumber ?? slot.doctor.office, startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString(), channel, visitKind: prices.visitKind, priceKzt: prices.prices[channel], visitPurpose: text(args.visitPurpose, 300) || 'Consultation' };
    cards.push(card);
    return { shown: true, note: 'The patient sees a card with a Confirm button. It is NOT booked until they press Confirm.' };
  }
  return { error: 'Unknown tool.' };
}

const dailyLimit = rateLimit({ windowMs: 24 * 60 * 60_000, max: config.ASSISTANT_DAILY_LIMIT, key: (req) => req.user?.id ?? '', message: 'You\'ve reached today\'s assistant limit. Try again tomorrow.' });

assistantRouter.post('/assistant/chat', requireAuth, requireRole(Role.PATIENT), dailyLimit, async (req: Request, res: Response) => {
  if (!config.GROQ_API_KEY) return res.status(503).json({ error: 'The assistant isn\'t available right now.' });
  const input = requestSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Write a message of up to 1,500 characters.' });
  const history = input.data.messages.slice(-HISTORY_MESSAGES);
  if (history[history.length - 1].role !== 'user') return res.status(400).json({ error: 'The last message must be yours.' });
  const patient = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true } });
  const messages: ChatMessage[] = [
    { role: 'system', content: `${ASSISTANT_RULES}\n\n${PLATFORM_GUIDE}\n\nToday is ${today()} (Asia/Almaty). The patient's first name is ${patient?.firstName ?? 'unknown'}.` },
    ...history.map((message) => ({ role: message.role, content: message.content }) as ChatMessage),
  ];
  const cards: BookingCard[] = [];
  let tokens = 0;
  try {
    const tools = await toolDefinitions();
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const result = await callGroq(messages, tools);
      tokens += result.usage?.total_tokens ?? 0;
      const reply = result.choices[0]?.message;
      if (!reply) break;
      if (!reply.tool_calls?.length) {
        console.info('assistant reply', { tokens, rounds: round + 1, cards: cards.length });
        return res.json({ reply: (reply.content ?? '').trim() || 'Sorry, I couldn\'t answer that. Try asking another way.', cards });
      }
      messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: reply.tool_calls });
      for (const call of reply.tool_calls) {
        let output: unknown;
        try { output = await runTool(call.function.name, JSON.parse(call.function.arguments || '{}'), req.user!.id, cards); }
        catch { output = { error: 'This lookup failed.' }; }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
      }
    }
    return res.json({ reply: cards.length ? 'Here is what I found. Check the card and press Confirm to book.' : 'Sorry, I couldn\'t finish that. Try a shorter question.', cards });
  } catch (error) {
    if (error instanceof AssistantBusyError) return res.status(429).json({ error: 'The assistant is busy right now. Try again in a minute.' });
    console.error('assistant failed', { name: error instanceof Error ? error.name : undefined });
    return res.status(502).json({ error: 'The assistant couldn\'t answer right now. Try again.' });
  }
});
