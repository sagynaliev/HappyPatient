import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';

const prismaMock = vi.hoisted(() => ({
  doctor: { findMany: vi.fn(), findUnique: vi.fn() },
  category: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  scheduleSlot: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  pricingRule: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock('./prisma', () => ({ prisma: prismaMock }));

let app: (typeof import('./app'))['app'];
let testConfig: (typeof import('./config'))['config'];
let signToken: (user: { id: string; email: string; role: Role }) => string;
const fetchMock = vi.fn();

beforeAll(async () => {
  process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
  process.env.JWT_SECRET ||= 'test-secret-with-at-least-16-chars';
  process.env.ASSISTANT_DAILY_LIMIT = '6';
  ({ app } = await import('./app.js'));
  ({ config: testConfig } = await import('./config.js'));
  ({ signToken } = await import('./auth.js'));
});

const token = (role: Role = Role.PATIENT, id = 'patient-1') => `Bearer ${signToken({ id, email: `${id}@example.test`, role })}`;
const groqReply = (message: Record<string, unknown>, status = 200, retryAfter?: string) => ({ ok: status < 400, status, headers: { get: (name: string) => (name === 'retry-after' ? retryAfter ?? null : null) }, json: async () => ({ choices: [{ message }], usage: { total_tokens: 120 } }) });
const slot = {
  id: 'slot-1', startAt: new Date('2099-03-02T04:00:00Z'), endAt: new Date('2099-03-02T04:30:00Z'),
  doctor: { id: 'doctor-1', categoryId: 'cat-1', consultationFee: 12000, office: 'Room 4', officeNumber: null, category: { name: 'Pediatrics' }, user: { firstName: 'Arman', lastName: 'Bekov' } },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  testConfig.GROQ_API_KEY = 'test-key';
  prismaMock.category.findMany.mockResolvedValue([{ name: 'Pediatrics' }]);
  prismaMock.user.findUnique.mockResolvedValue({ firstName: 'Aigerim' });
  prismaMock.pricingRule.findMany.mockResolvedValue([]);
  prismaMock.scheduleSlot.findFirst.mockResolvedValue(null);
  prismaMock.scheduleSlot.findMany.mockResolvedValue([]);
});

describe('POST /api/assistant/chat', () => {
  it('answers patients only', async () => {
    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.DOCTOR, 'doctor-user')).send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says it is unavailable without a Groq key', async () => {
    testConfig.GROQ_API_KEY = undefined;
    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-nokey')).send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a conversation that does not end with the patient', async () => {
    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-order')).send({ messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }] });
    expect(response.status).toBe(400);
  });

  it('runs a tool, proposes a booking card and never books', async () => {
    prismaMock.scheduleSlot.findMany.mockResolvedValue([slot]);
    prismaMock.scheduleSlot.count.mockResolvedValue(0); // no earlier visits: first visit
    fetchMock
      .mockResolvedValueOnce(groqReply({ content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'propose_booking', arguments: JSON.stringify({ slotIds: ['slot-1'], channel: 'online', visitPurpose: 'Cough' }) } }] }))
      .mockResolvedValueOnce(groqReply({ content: 'Here is the time. Press Confirm to book.' }));

    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-book')).send({ messages: [{ role: 'user', content: 'Book Dr. Bekov online' }] });

    expect(response.status).toBe(200);
    expect(response.body.reply).toBe('Here is the time. Press Confirm to book.');
    expect(response.body.cards).toEqual([expect.objectContaining({ slotId: 'slot-1', doctorId: 'doctor-1', doctorName: 'Dr. Arman Bekov', channel: 'online', visitKind: 'first', priceKzt: 12000, visitPurpose: 'Cough' })]);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages.at(-1)).toEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }));
    expect(JSON.parse(second.messages.at(-1).content)).toEqual(expect.objectContaining({ shown: 1 }));
    expect(second.messages[0].content).toContain('Aigerim');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer test-key');
  });

  it('finds only doctors with free times on the asked day, and offers the nearest days when that day is full', async () => {
    prismaMock.location.findMany.mockResolvedValue([]);
    prismaMock.scheduleSlot.groupBy
      .mockResolvedValueOnce([]) // tomorrow: nobody free
      .mockResolvedValueOnce([{ doctorId: 'doctor-2', _min: { startAt: new Date('2099-03-03T05:00:00Z') } }, { doctorId: 'doctor-1', _min: { startAt: new Date('2099-03-02T04:00:00Z') } }]);
    prismaMock.doctor.findMany.mockResolvedValue([
      { id: 'doctor-1', categoryId: 'cat-1', consultationFee: 12000, city: 'Almaty', office: 'Room 204', officeNumber: 'Room 204', category: { name: 'Pediatrics' }, user: { firstName: 'Arman', lastName: 'Bekov' } },
      { id: 'doctor-2', categoryId: 'cat-1', consultationFee: 10000, city: 'Almaty', office: null, officeNumber: null, category: { name: 'Pediatrics' }, user: { firstName: 'Dana', lastName: 'Sapar' } },
    ]);
    prismaMock.scheduleSlot.findMany.mockResolvedValue([{ id: 'slot-9', startAt: new Date('2099-03-02T04:00:00Z') }]);
    fetchMock
      .mockResolvedValueOnce(groqReply({ content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search_doctors', arguments: JSON.stringify({ date: '2099-03-01' }) } }] }))
      .mockResolvedValueOnce(groqReply({ content: 'Tomorrow is full; the nearest is Dr. Arman Bekov on 2 Mar.' }));

    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-search')).send({ messages: [{ role: 'user', content: 'Find a doctor for tomorrow' }] });

    expect(response.status).toBe(200);
    const result = JSON.parse(JSON.parse(fetchMock.mock.calls[1][1].body).messages.at(-1).content);
    expect(result.note).toMatch(/No free times on Sunday 1 Mar/);
    expect(result.doctors.map((doctor: { name: string }) => doctor.name)).toEqual(['Dr. Arman Bekov', 'Dr. Dana Sapar']);
    expect(result.doctors[0].freeTimes[0]).toEqual(expect.objectContaining({ slotId: 'slot-9' }));
    // The first search looked only at that day; only doctors with a free slot are asked for.
    const firstWhere = prismaMock.scheduleSlot.groupBy.mock.calls[0][0].where;
    expect(firstWhere.status).toBe('FREE');
    expect(firstWhere.startAt.lt.toISOString()).toBe('2099-03-01T19:00:00.000Z');
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(prompt).toMatch(/tomorrow is \d{4}-\d{2}-\d{2}/);
  });

  it('sends only the last 10 messages and the system prompt', async () => {
    fetchMock.mockResolvedValueOnce(groqReply({ content: 'Sure.' }));
    const messages = Array.from({ length: 13 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-history')).send({ messages });
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(12); // rules, 10 messages, reply language
    expect(body.messages.at(-1)).toEqual({ role: 'system', content: expect.stringMatching(/latest message is in English/) });
    expect(body.messages[1].content).toBe('m3');
    expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(['search_doctors', 'get_free_slots', 'get_my_prices', 'get_my_appointments', 'propose_booking']);
  });

  it('shows booking cards straight from a search with offer, in one model round fewer', async () => {
    prismaMock.location.findMany.mockResolvedValue([]);
    prismaMock.scheduleSlot.groupBy.mockResolvedValueOnce([{ doctorId: 'doctor-1', _min: { startAt: slot.startAt } }]);
    prismaMock.doctor.findMany.mockResolvedValue([{ ...slot.doctor, city: 'Almaty' }]);
    prismaMock.scheduleSlot.findMany
      .mockResolvedValueOnce([{ id: 'slot-1', startAt: slot.startAt }]) // the doctor's first free times
      .mockResolvedValueOnce([slot]); // the times turned into cards
    prismaMock.scheduleSlot.count.mockResolvedValue(0);
    fetchMock
      .mockResolvedValueOnce(groqReply({ content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_doctors', arguments: JSON.stringify({ specialty: 'Pediatrics', offer: true }) } }] }))
      .mockResolvedValueOnce(groqReply({ content: 'Pick a time below.' }));
    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-offer')).send({ messages: [{ role: 'user', content: 'Book a pediatrician' }] });
    expect(response.status).toBe(200);
    expect(response.body.cards).toEqual([expect.objectContaining({ slotId: 'slot-1', doctorName: 'Dr. Arman Bekov' })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(JSON.parse(fetchMock.mock.calls[1][1].body).messages.at(-1).content)).toEqual(expect.objectContaining({ cardsShown: 1 }));
  });

  it('moves to the fallback model when the main one hits its per-minute limit', async () => {
    fetchMock.mockResolvedValueOnce(groqReply({}, 429)).mockResolvedValueOnce(groqReply({ content: 'Hello from the fallback.' }));
    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-fallback')).send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(response.status).toBe(200);
    expect(response.body.reply).toBe('Hello from the fallback.');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('openai/gpt-oss-120b');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('openai/gpt-oss-20b');
  });

  it('waits once for the limit to reset when both models are busy', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    fetchMock.mockResolvedValueOnce(groqReply({}, 429, '2')).mockResolvedValueOnce(groqReply({}, 429, '2')).mockResolvedValueOnce(groqReply({ content: 'Back again.' }));
    const pending = request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-wait')).send({ messages: [{ role: 'user', content: 'Hi' }] }).then((value) => value);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(2000);
    const response = await pending;
    vi.useRealTimers();
    expect(response.status).toBe(200);
    expect(response.body.reply).toBe('Back again.');
  });

  it('maps a busy Groq to 429 and other failures to 502', async () => {
    fetchMock.mockResolvedValueOnce(groqReply({}, 429)).mockResolvedValueOnce(groqReply({}, 429));
    const busy = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-busy')).send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(busy.status).toBe(429);
    fetchMock.mockResolvedValueOnce(groqReply({}, 500));
    const failed = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-busy')).send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(failed.status).toBe(502);
  });

  it('stops a patient after the daily limit', async () => {
    fetchMock.mockResolvedValue(groqReply({ content: 'Ok.' }));
    const send = () => request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-limit')).send({ messages: [{ role: 'user', content: 'Hi' }] });
    for (let index = 0; index < 6; index += 1) expect((await send()).status).toBe(200);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/today's assistant limit/);
  });
});

describe('reply language', () => {
  it('follows the latest message: Kazakh letters, Russian Cyrillic, otherwise English', async () => {
    const { replyLanguage } = await import('./assistant.js');
    expect(replyLanguage('Ертең педиатрға жазылғым келеді')).toBe('Kazakh');
    expect(replyLanguage('Хочу записаться к врачу')).toBe('Russian');
    expect(replyLanguage('I have a headache')).toBe('English');
  });
});
