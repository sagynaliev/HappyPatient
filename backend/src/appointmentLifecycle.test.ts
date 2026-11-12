import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ scheduleSlot: { findMany: vi.fn(), updateMany: vi.fn() }, expiredAppointment: { create: vi.fn() }, notification: { create: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn() }));
vi.mock('./prisma', () => ({ prisma: db }));
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: class { emails = { send: sendEmail }; } }));
vi.mock('./config', () => ({ config: { RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'clinic@example.test', FRONTEND_URL: 'https://clinic.example.test' } }));
import { releaseUnattendedSlots } from './appointmentLifecycle';
const now = new Date('2026-11-02T05:10:00Z');
const initial = () => ({ id: 'slot', patientId: 'patient', doctorId: 'doctor', patient: { email: 'patient@example.test' }, status: 'BOOKED', checkedInAt: null as Date | null, startAt: new Date('2026-11-02T05:00:00Z'), endAt: new Date('2026-11-02T05:30:00Z'), updatedAt: new Date('2026-11-01T00:00:00Z') });
let slot = initial();
beforeEach(() => {
  vi.resetAllMocks(); slot = initial();
  db.$transaction.mockImplementation(callback => callback(db));
  db.scheduleSlot.findMany.mockImplementation(({ where }) => Promise.resolve(slot.status === where.status && slot.checkedInAt === null && slot.startAt <= where.startAt.lte ? [{ ...slot }] : []));
  db.scheduleSlot.updateMany.mockImplementation(({ where }) => { const matches = slot.status === where.status && slot.checkedInAt === null && slot.updatedAt === where.updatedAt; if (matches) slot.status = 'FREE'; return Promise.resolve({ count: matches ? 1 : 0 }); });
  db.expiredAppointment.create.mockResolvedValue({ id: 'expired' });
  db.notification.create.mockResolvedValue({ id: 'notification' });
  sendEmail.mockResolvedValue({ error: null });
});
describe('unattended appointment release', () => {
  it('releases at exactly 10:00 and audits the expired visit', async () => {
    expect(await releaseUnattendedSlots(now)).toEqual({ count: 1 });
    expect(db.expiredAppointment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ slotId: 'slot', appointmentId: 'slot', status: 'expired', reason: 'auto_release_no_checkin', createdAt: now }) });
  });
  it('does not release at 9:59', async () => { expect(await releaseUnattendedSlots(new Date(now.getTime() - 1000))).toEqual({ count: 0 }); });
  it('does not release checked-in booked slots', async () => { slot.checkedInAt = now; expect(await releaseUnattendedSlots(now)).toEqual({ count: 0 }); });
  it('does not release occupied slots', async () => { slot.status = 'OCCUPIED'; expect(await releaseUnattendedSlots(now)).toEqual({ count: 0 }); });
  it('is idempotent', async () => { await releaseUnattendedSlots(now); expect(await releaseUnattendedSlots(now)).toEqual({ count: 0 }); expect(db.expiredAppointment.create).toHaveBeenCalledTimes(1); });
  it('conditional writes protect concurrent job runs', async () => { const results = await Promise.all([releaseUnattendedSlots(now), releaseUnattendedSlots(now)]); expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1); expect(db.expiredAppointment.create).toHaveBeenCalledTimes(1); });
  it('protects check-in after candidate selection', async () => { db.scheduleSlot.updateMany.mockResolvedValue({ count: 0 }); expect(await releaseUnattendedSlots(now)).toEqual({ count: 0 }); expect(db.expiredAppointment.create).not.toHaveBeenCalled(); });
  it('uses UTC instants including an Almaty offset', async () => { expect(await releaseUnattendedSlots(new Date('2026-11-02T10:10:00+05:00'))).toEqual({ count: 1 }); });
  it('tells the patient once that the visit was missed and the time released', async () => {
    await releaseUnattendedSlots(now);
    await vi.waitFor(() => expect(db.notification.create).toHaveBeenCalledTimes(1));
    const data = db.notification.create.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ userId: 'patient', slotId: 'slot', type: 'VISIT_MISSED', eventKey: 'MISSED:slot:2026-11-01T00:00:00.000Z' }));
    expect(data.message).toMatch(/not checked in within 10 minutes/);
    await releaseUnattendedSlots(now);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });
  it('sends one email after saving the in-app notice and links to Past', async () => {
    await Promise.all([releaseUnattendedSlots(now), releaseUnattendedSlots(now)]);
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ channel: 'in-app' }) });
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      from: 'clinic@example.test',
      to: 'patient@example.test',
      subject: expect.stringContaining('Missed visit'),
      text: expect.stringContaining('https://clinic.example.test/appointments?tab=past'),
    }), { idempotencyKey: 'MISSED:slot:2026-11-01T00:00:00.000Z' });
    expect(sendEmail.mock.invocationCallOrder[0]).toBeGreaterThan(db.notification.create.mock.invocationCallOrder[0]);
    expect(db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DELIVERED' }),
    }));
  });
  it('keeps the release and the in-app notice when Resend rejects the email', async () => {
    sendEmail.mockResolvedValue({ error: { message: 'rejected' } });
    expect(await releaseUnattendedSlots(now)).toEqual({ count: 1 });
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });
  it('sends no message when nothing was released', async () => { await releaseUnattendedSlots(new Date(now.getTime() - 1000)); expect(db.notification.create).not.toHaveBeenCalled(); });
});
