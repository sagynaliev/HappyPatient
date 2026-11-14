import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';

const prismaMock = vi.hoisted(() => ({
  doctor: { findMany: vi.fn(), findUnique: vi.fn() },
  category: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  scheduleSlot: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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
const groqReply = (message: Record<string, unknown>, status = 200) => ({ ok: status < 400, status, json: async () => ({ choices: [{ message }], usage: { total_tokens: 120 } }) });
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
    prismaMock.scheduleSlot.findFirst.mockResolvedValue(slot);
    prismaMock.scheduleSlot.count.mockResolvedValue(0); // no earlier visits: first visit
    fetchMock
      .mockResolvedValueOnce(groqReply({ content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'propose_booking', arguments: JSON.stringify({ slotId: 'slot-1', channel: 'online', visitPurpose: 'Cough' }) } }] }))
      .mockResolvedValueOnce(groqReply({ content: 'Here is the time. Press Confirm to book.' }));

    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-book')).send({ messages: [{ role: 'user', content: 'Book Dr. Bekov online' }] });

    expect(response.status).toBe(200);
    expect(response.body.reply).toBe('Here is the time. Press Confirm to book.');
    expect(response.body.cards).toEqual([expect.objectContaining({ slotId: 'slot-1', doctorId: 'doctor-1', doctorName: 'Dr. Arman Bekov', channel: 'online', visitKind: 'first', priceKzt: 12000, visitPurpose: 'Cough' })]);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages.at(-1)).toEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }));
    expect(JSON.parse(second.messages.at(-1).content)).toEqual(expect.objectContaining({ shown: true }));
    expect(second.messages[0].content).toContain('Aigerim');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer test-key');
  });

  it('sends only the last 10 messages and the system prompt', async () => {
    fetchMock.mockResolvedValueOnce(groqReply({ content: 'Sure.' }));
    const messages = Array.from({ length: 13 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
    const response = await request(app).post('/api/assistant/chat').set('Authorization', token(Role.PATIENT, 'patient-history')).send({ messages });
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(11);
    expect(body.messages[1].content).toBe('m3');
    expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(['search_doctors', 'get_free_slots', 'get_my_prices', 'get_my_appointments', 'propose_booking']);
  });

  it('maps a busy Groq to 429 and other failures to 502', async () => {
    fetchMock.mockResolvedValueOnce(groqReply({}, 429));
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
