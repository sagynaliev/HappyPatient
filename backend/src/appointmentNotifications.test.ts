import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), config: { RESEND_API_KEY: 'test-key' as string | undefined } }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('./config', () => ({ config: mocks.config }));
vi.mock('./prisma', () => ({ prisma: { notification: { create: mocks.create, updateMany: mocks.updateMany }, user: { findUnique: mocks.findUnique } } }));
import { recordAppointmentNotification, notifyUser } from './appointmentNotifications';
const input = { slotId: 'slot-123', userId: 'patient-123', email: 'patient@example.test', event: 'CHECKED_IN' as const, reference: 'HP-123', doctor: 'Dr. Әлия', startAt: new Date('2026-10-29T20:30:00Z'), doctorUserId: 'doctor-123', patientName: 'Casey Patient', occurrenceId: 'receipt-db-123', receipt: { id: 'receipt-db-123', reference: 'HP-123', patientName: 'Casey Patient', doctor: 'Dr. Әлия', startAt: new Date('2026-10-29T20:30:00Z'), checkedInAt: new Date('2026-10-29T20:15:00Z') } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.RESEND_API_KEY = 'test-key';
  const keys = new Set<string>();
  mocks.create.mockImplementation(async ({ data }) => { if (keys.has(data.eventKey)) throw { code: 'P2002' }; keys.add(data.eventKey); return { id: data.eventKey, ...data }; });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.send.mockResolvedValue({ error: null });
});
describe('appointment delivery', () => {
  it('attaches a valid registration PDF to patient check-in and preserves doctor in-app delivery', async () => {
    await recordAppointmentNotification(input);
    expect(mocks.send).toHaveBeenCalledOnce();
    const [payload, options] = mocks.send.mock.calls[0];
    expect(payload).toMatchObject({ to: input.email, subject: 'Visit Check-in Confirmed | Happy Patient' });
    expect(payload.html).toContain('You&#39;re checked in!');
    expect(payload.text).toContain('Checked In');
    expect(options.idempotencyKey).toContain(input.receipt.id);
    expect(payload.attachments[0].filename).toBe('HappyPatient-registration-HP-123.pdf');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(payload.attachments[0].content) });
    const pdf = await task.promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    expect(content.items.map(item => 'str' in item ? item.str : '').join(' ')).toContain(input.receipt.id);
    await task.destroy();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'doctor-123', channel: 'in-app', subject: 'Patient has arrived' }) }));
  });
  it('suppresses repeated and concurrent events before generating PDFs or sending email', async () => {
    await Promise.all([recordAppointmentNotification(input), recordAppointmentNotification(input), recordAppointmentNotification(input)]);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledOnce();
  });
  it('permits a new booking occurrence on the same reused slot', async () => {
    await recordAppointmentNotification({ ...input, event: 'BOOKED', receipt: undefined, occurrenceId: 'booking-1' });
    await recordAppointmentNotification({ ...input, event: 'BOOKED', receipt: undefined, occurrenceId: 'booking-2' });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][0].attachments).toBeUndefined();
  });
  it.each(['reject', 'throw'])('records a provider %s without throwing or leaking content', async mode => {
    if (mode === 'reject') mocks.send.mockResolvedValue({ error: { message: 'private provider detail' } });
    else mocks.send.mockRejectedValue(new Error('private provider detail'));
    await expect(recordAppointmentNotification(input)).resolves.toBeDefined();
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(JSON.stringify(mocks.updateMany.mock.calls)).not.toContain('private provider detail');
  });
  it('never sends a check-in email without a receipt', async () => {
    await recordAppointmentNotification({ ...input, receipt: undefined });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });
  it('records local notifications when email is unconfigured', async () => {
    mocks.config.RESEND_API_KEY = undefined;
    await recordAppointmentNotification(input);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ channel: 'in-app', status: 'RECORDED' }) }));
  });
  it('does not contact Resend if persisting the event fails', async () => {
    mocks.create.mockRejectedValue(new Error('Database unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordAppointmentNotification(input)).resolves.toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it('brands other existing system notifications', async () => {
    await notifyUser({ userId: 'patient', type: 'PROFILE_UPDATED', email: input.email, subject: 'Profile updated', message: 'Your profile was updated.' });
    expect(mocks.send.mock.calls[0][0].html).toContain('HappyPatient');
    expect(mocks.send.mock.calls[0][0].text).toContain('Your profile was updated.');
  });
});
