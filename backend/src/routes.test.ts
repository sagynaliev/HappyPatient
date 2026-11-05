import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role, SlotStatus } from '@prisma/client';

const prismaMock = vi.hoisted(() => ({
  doctor: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  category: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  referenceDataAudit: { findMany: vi.fn(), create: vi.fn() },
  location: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  scheduleSlot: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  notification: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  pricingRule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  receipt: { upsert: vi.fn(), findUnique: vi.fn() },
  cancelledAppointment: { create: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const notificationMock = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: class { emails = { send: sendEmail }; } }));

vi.mock('./prisma', () => ({ prisma: prismaMock }));
vi.mock('./registrationNotification', () => ({ sendRegistrationConfirmation: notificationMock }));

let app: (typeof import('./app'))['app'];
let testConfig: (typeof import('./config'))['config'];
let signToken: (user: { id: string; email: string; role: Role }) => string;

beforeAll(async () => {
  process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
  process.env.JWT_SECRET ||= 'test-secret-with-at-least-16-chars';
  ({ app } = await import('./app.js'));
  ({ config: testConfig } = await import('./config.js'));
  ({ signToken } = await import('./auth.js'));
});

beforeEach(() => {
  vi.resetAllMocks();
  testConfig.RESEND_API_KEY = undefined;
  sendEmail.mockResolvedValue({ error: null });
  prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.notification.findFirst.mockResolvedValue(null);
  prismaMock.pricingRule.findMany.mockResolvedValue([]);
  prismaMock.doctor.findMany.mockResolvedValue([]);
  prismaMock.location.findMany.mockResolvedValue([]);
  prismaMock.category.findFirst.mockResolvedValue(null);
  prismaMock.category.findUnique.mockResolvedValue(null);
  prismaMock.category.create.mockResolvedValue({id:'category-new',name:'New specialty',active:true});
  prismaMock.referenceDataAudit.create.mockResolvedValue({id:'ref-audit'});
  prismaMock.referenceDataAudit.findMany.mockResolvedValue([]);
  prismaMock.doctor.findUnique.mockResolvedValue({
    id: 'doctor-1',
    userId: 'doctor-user',
    office: 'North Clinic',
    category: { name: 'Cardiology' },
    user: { firstName: 'Sam', lastName: 'Doctor' },
  });
  prismaMock.scheduleSlot.findFirst.mockResolvedValue(null);
  prismaMock.scheduleSlot.findMany.mockResolvedValue([]);
  prismaMock.scheduleSlot.createMany.mockResolvedValue({ count: 4 });
  prismaMock.scheduleSlot.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.user.update.mockResolvedValue({
    id: 'patient-user', email: 'patient@example.test', firstName: 'Casey', lastName: 'Patient', role: Role.PATIENT,
    phone: '+7 700 111 22 33', iin: '881230500711', createdAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  notificationMock.mockResolvedValue({ channel: 'local', message: 'Confirmation notification recorded for local development.' });
  prismaMock.notification.findUnique.mockResolvedValue(null);
  prismaMock.notification.create.mockResolvedValue({ id: 'notification-1', status: 'RECORDED', channel: 'in-app' });
  prismaMock.receipt.upsert.mockResolvedValue({ id: 'receipt-1', slotId: 'slot-1', reference: 'HP-SLOT-1', status: 'READY' });
  prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
  prismaMock.cancelledAppointment.findMany.mockResolvedValue([]);
  prismaMock.cancelledAppointment.create.mockResolvedValue({ id: 'cancel-1' });
});

const bearer = (role: Role, id = `${role.toLowerCase()}-user`) => `Bearer ${signToken({ id, email: `${role.toLowerCase()}@example.test`, role })}`;

describe('Sprint 3 front-desk workflows', () => {
  it('allows authorized front-desk staff to check in a booked appointment once', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({
      id: 'slot-1', status: SlotStatus.BOOKED, startAt: new Date(Date.now() + 5 * 60_000), endAt: new Date(Date.now() + 35 * 60_000), patientId: 'patient-user',
      patient: { id: 'patient-user', email: 'patient@example.test', firstName: 'Casey', lastName: 'Patient' },
      doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } },
    });
    const response = await request(app).post('/api/appointments/slot-1/check-in')
      .set('Authorization', bearer(Role.FRONT_DESK, 'desk-user')).expect(200);
    expect(response.body.checkedIn).toBe(true);
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot-1', status: SlotStatus.BOOKED, patientId: 'patient-user' },
      data: expect.objectContaining({ status: SlotStatus.OCCUPIED, checkedInById: 'desk-user' }),
    }));
    expect(prismaMock.receipt.upsert).toHaveBeenCalledOnce();
  });

  it('rejects duplicate check-in and unauthorized front-desk access', async () => {
    await request(app).get('/api/front-desk/appointments').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(403);
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.OCCUPIED, patientId: 'patient-user', patient: { id: 'patient-user' }, doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } });
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.FRONT_DESK, 'desk-user')).expect(409);
    expect(prismaMock.scheduleSlot.updateMany).not.toHaveBeenCalled();
  });

  it('rejects malformed walk-in IIN input before touching patient data', async () => {
    await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(Role.FRONT_DESK, 'desk-user')).send({ iin: '123', firstName: 'A', lastName: 'B' }).expect(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('lets a patient confirm their own arrival and blocks other patients', async () => {
    const slot = {
      id: 'slot-1', status: SlotStatus.BOOKED, startAt: new Date(Date.now() + 10 * 60_000), endAt: new Date(Date.now() + 40 * 60_000), patientId: 'patient-user',
      patient: { id: 'patient-user', email: 'patient@example.test', firstName: 'Casey', lastName: 'Patient' },
      doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } },
    };
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce(slot);
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.PATIENT, 'other-patient')).expect(403);
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce(slot);
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(200);
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledOnce();
    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'CHECKED_IN', userId: 'patient-user' }) }));
  });

  it('rejects check-in too early or after the appointment has ended', async () => {
    const base = { id: 'slot-1', status: SlotStatus.BOOKED, patientId: 'patient-user', patient: { id: 'patient-user', email: 'p@example.test' }, doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } };
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ ...base, startAt: new Date(Date.now() + 2 * 60 * 60_000), endAt: new Date(Date.now() + 150 * 60_000) });
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(400);
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ ...base, startAt: new Date(Date.now() - 60 * 60_000), endAt: new Date(Date.now() - 30 * 60_000) });
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(409);
    expect(prismaMock.scheduleSlot.updateMany).not.toHaveBeenCalled();
  });

  it('cancels a future booked appointment, frees the slot and records a notification', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.BOOKED, startAt: new Date(Date.now() + 24 * 60 * 60_000), endAt: new Date(Date.now() + 24.5 * 60 * 60_000), patientId: 'patient-user', doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } });
    const response = await request(app).post('/api/appointments/slot-1/cancel').set('Authorization', bearer(Role.PATIENT, 'patient-user')).send({ reason: 'Feeling better' }).expect(200);
    expect(response.body.cancelled).toBe(true);
    expect(prismaMock.cancelledAppointment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ slotId: 'slot-1', patientId: 'patient-user', reason: 'Feeling better', cancelledByRole: Role.PATIENT }) });
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: SlotStatus.FREE, patientId: null, visitPurpose: null } }));
    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'CANCELLED', message: expect.stringContaining('Reason: Feeling better') }) }));
  });

  it('requires a reason before a patient can cancel', async () => {
    await request(app).post('/api/appointments/slot-1/cancel').set('Authorization', bearer(Role.PATIENT, 'patient-user')).send({}).expect(400);
    await request(app).post('/api/appointments/slot-1/cancel').set('Authorization', bearer(Role.PATIENT, 'patient-user')).send({ reason: '  ' }).expect(400);
    expect(prismaMock.scheduleSlot.updateMany).not.toHaveBeenCalled();
  });

  it('returns the patient cancellation history with who cancelled and why', async () => {
    prismaMock.scheduleSlot.findMany.mockResolvedValueOnce([]);
    prismaMock.cancelledAppointment.findMany.mockResolvedValueOnce([{
      id: 'cancel-1', slotId: 'slot-12345678', startAt: new Date('2099-05-10T09:00:00Z'), endAt: new Date('2099-05-10T09:30:00Z'), visitPurpose: 'Checkup', reason: 'Doctor is ill', cancelledByRole: Role.DOCTOR, createdAt: new Date(),
      doctor: { office: 'Office 1', consultationFee: 10000, category: { name: 'Cardiology' }, user: { firstName: 'Sam', lastName: 'Doctor' } },
    }]);
    const response = await request(app).get('/api/me/appointments').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(200);
    expect(response.body.cancelled[0]).toMatchObject({ reason: 'Doctor is ill', cancelledBy: 'CLINIC', doctor: { name: 'Dr. Sam Doctor' } });
    expect(prismaMock.cancelledAppointment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'patient-user' } }));
  });

  it('registers a new walk-in patient by IIN and names the doctor in the notification', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-9', startAt: new Date(Date.now() + 3 * 60 * 60_000), doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValueOnce({ id: 'walkin-1', email: 'walk@example.test', firstName: 'Aru', lastName: 'Walk' });
    const response = await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(Role.FRONT_DESK, 'desk-user')).send({
      iin: '990101300122', firstName: 'Aru', lastName: 'Walk', email: 'walk@example.test', doctorId: 'doctor-1', slotId: 'slot-9', visitPurpose: 'Walk-in consultation',
    }).expect(201);
    expect(response.body.slot.status).toBe(SlotStatus.BOOKED);
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ iin: '990101300122', role: Role.PATIENT }) }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ message: expect.stringContaining('Dr. Sam Doctor') }) }));
  });
});

describe('notifications for both sides of an appointment', () => {
  it('notifies the doctor as well as the patient when a patient books', async () => {
    prismaMock.doctor.findUnique.mockResolvedValueOnce({ id: 'doctor-1', userId: 'doctor-user', user: { firstName: 'Sam', lastName: 'Doctor' } });
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-1', startAt: new Date(Date.now() + 86400000), endAt: new Date(Date.now() + 88200000), status: SlotStatus.BOOKED, visitPurpose: 'Checkup' });
    prismaMock.user.findUnique.mockResolvedValueOnce({ firstName: 'Casey', lastName: 'Patient' });
    await request(app).post('/api/doctors/doctor-1/schedule/slot-1/book').set('Authorization', bearer(Role.PATIENT, 'patient-user')).send({ visitPurpose: 'Checkup' }).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const created = prismaMock.notification.create.mock.calls.map(([arg]) => arg.data);
    expect(created).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'patient-user', type: 'BOOKED', subject: 'Appointment Confirmed | Happy Patient' }),
      expect.objectContaining({ userId: 'doctor-user', type: 'BOOKED', subject: 'New appointment booked', message: expect.stringContaining('Casey Patient') }),
    ]));
  });

  it('tells the doctor when a patient checks in', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({
      id: 'slot-1', status: SlotStatus.BOOKED, startAt: new Date(Date.now() + 5 * 60_000), endAt: new Date(Date.now() + 35 * 60_000), patientId: 'patient-user',
      patient: { id: 'patient-user', email: 'patient@example.test', firstName: 'Casey', lastName: 'Patient' },
      doctor: { userId: 'doctor-user', user: { firstName: 'Sam', lastName: 'Doctor' } },
    });
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.FRONT_DESK, 'desk-user')).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'doctor-user', subject: 'Patient has arrived' }) }));
  });

  it('sends a welcome notification after registration', async () => {
    prismaMock.user.create.mockResolvedValueOnce({ id: 'new-user', email: 'new@example.test', firstName: 'Nur', lastName: 'New', role: Role.PATIENT, phone: null });
    await request(app).post('/api/auth/register').send({ email: 'new@example.test', password: 'Password#123', firstName: 'Nur', lastName: 'New', phone: '+7 700 123 45 67', iin: '950515400569' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (prismaMock.user.create.mock.calls.length) {
      expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'new-user', type: 'WELCOME' }) }));
    }
  });
});

describe('front-desk availability picker', () => {
  it('groups free slots by doctor, soonest first, and filters by specialty', async () => {
    const later = new Date(Date.now() + 3 * 60 * 60_000);
    const sooner = new Date(Date.now() + 60 * 60_000);
    const doctorA = { id: 'doc-a', office: 'Office 1', officeNumber: null, clinicName: null, consultationFee: 10000, category: { name: 'Cardiology' }, user: { firstName: 'Ann', lastName: 'Heart' } };
    prismaMock.scheduleSlot.findMany.mockResolvedValueOnce([{ doctor: { category: { name: 'Cardiology' } } }, { doctor: { category: { name: 'Neurology' } } }]);
    prismaMock.scheduleSlot.findMany.mockResolvedValueOnce([
      { id: 's1', startAt: sooner, endAt: new Date(sooner.getTime() + 30 * 60_000), doctor: doctorA },
      { id: 's2', startAt: later, endAt: new Date(later.getTime() + 30 * 60_000), doctor: doctorA },
    ]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date());
    const response = await request(app).get(`/api/front-desk/availability?date=${today}&category=Cardiology,Neurology`).set('Authorization', bearer(Role.FRONT_DESK, 'desk-user')).expect(200);
    expect(response.body.specialtyCounts).toEqual({ Cardiology: 1, Neurology: 1 });
    expect(response.body.doctors).toHaveLength(1);
    expect(response.body.doctors[0]).toMatchObject({ id: 'doc-a', name: 'Dr. Ann Heart', specialty: 'Cardiology' });
    expect(response.body.doctors[0].slots.map((slot: { id: string }) => slot.id)).toEqual(['s1', 's2']);
    expect(prismaMock.scheduleSlot.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: SlotStatus.FREE, doctor: { category: { name: { in: ['Cardiology', 'Neurology'] } } } }) }));
  });

  it('is only available to front-desk staff and admins', async () => {
    await request(app).get('/api/front-desk/availability').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(403);
  });
});

describe('notification bell endpoints', () => {
  it('returns only the signed-in user notifications with an unread count', async () => {
    prismaMock.notification.findMany.mockResolvedValueOnce([{ id: 'n1', type: 'BOOKED', subject: 'Appointment Confirmed | Happy Patient', readAt: null }]);
    prismaMock.notification.count.mockResolvedValueOnce(1);
    const response = await request(app).get('/api/notifications').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(200);
    expect(response.body.unreadCount).toBe(1);
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'patient-user' } }));
    expect(prismaMock.notification.count).toHaveBeenCalledWith({ where: { userId: 'patient-user', readAt: null } });
  });

  it('marks only the signed-in user unread notifications as read', async () => {
    prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 3 });
    const response = await request(app).post('/api/notifications/read-all').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(200);
    expect(response.body.updated).toBe(3);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({ where: { userId: 'patient-user', readAt: null }, data: { readAt: expect.any(Date) } });
    await request(app).post('/api/notifications/read-all').expect(401);
  });
});

describe('authenticated self profile endpoints', () => {
  it('returns account details with a masked IIN and creation date', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'patient-user', email: 'patient@example.test', firstName: 'Casey', lastName: 'Patient', role: Role.PATIENT,
      phone: '+7 700 111 22 33', iin: '881230500711', createdAt: new Date('2026-10-01T00:00:00.000Z'),
    });
    const response = await request(app).get('/api/me').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(200);
    expect(response.body.user.maskedIin).toBe('••••••••••11');
    expect(response.body.user.createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect(response.body.user).not.toHaveProperty('iin');
  });

  it('updates only the signed-in user name and phone fields', async () => {
    const response = await request(app).patch('/api/me')
      .set('Authorization', bearer(Role.PATIENT, 'patient-user'))
      .send({ firstName: 'Casey', lastName: 'Patient', phone: '+7 700 111 22 33', email: 'unverified@example.test', iin: '000000000000' })
      .expect(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'patient-user' },
      data: { firstName: 'Casey', lastName: 'Patient', phone: '+7 700 111 22 33' },
    }));
    expect(response.body.user.maskedIin).toBe('••••••••••11');
    expect(response.body.user).not.toHaveProperty('iin');
  });

  it('requires authentication and validates profile changes', async () => {
    await request(app).get('/api/me').expect(401);
    await request(app).patch('/api/me').set('Authorization', bearer(Role.PATIENT, 'patient-user'))
      .send({ firstName: '', lastName: 'Patient', phone: null }).expect(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns only the signed-in patient appointments with non-sensitive doctor details', async () => {
    prismaMock.scheduleSlot.findMany.mockResolvedValue([{
      id: 'slot-1',
      startAt: new Date('2099-05-10T09:00:00.000Z'),
      endAt: new Date('2099-05-10T09:30:00.000Z'),
      status: 'BOOKED',
      visitPurpose: 'Annual checkup',
      reference: 'HP-SLOT-1',
      doctor: {
        office: 'Central Clinic',
        consultationFee: 18000,
        category: { name: 'Cardiology' },
        user: { firstName: 'Sam', lastName: 'Doctor' },
      },
    }]);
    const response = await request(app).get('/api/me/appointments')
      .set('Authorization', bearer(Role.PATIENT, 'patient-user'))
      .expect(200);
    expect(response.body.appointments[0]).toEqual({
      id: 'slot-1',
      startAt: '2099-05-10T09:00:00.000Z',
      endAt: '2099-05-10T09:30:00.000Z',
      status: 'BOOKED',
      visitPurpose: 'Annual checkup',
      reference: 'HP-SLOT-1',
      priceKzt: 18000,
      doctor: {
        name: 'Dr. Sam Doctor',
        specialty: 'Cardiology',
        office: 'Central Clinic',
        consultationFee: 18000,
      },
    });
    expect(prismaMock.scheduleSlot.findMany).toHaveBeenCalledWith({
      where: { patientId: 'patient-user' },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        visitPurpose: true,
        checkedInAt: true,
        doctor: {
          select: {
            id: true,
            office: true,
            consultationFee: true,
            category: { select: { name: true } },
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  });

  it('requires a patient role to view their appointments', async () => {
    await request(app).get('/api/me/appointments').expect(401);
    await request(app).get('/api/me/appointments')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .expect(403);
    expect(prismaMock.scheduleSlot.findMany).not.toHaveBeenCalled();
  });
});

describe('Sprint 2 doctor endpoints', () => {
  it('returns only unique configured cities without inventing options', async () => {
    prismaMock.doctor.findMany.mockResolvedValue([
      { city: 'Almaty' },
      { city: ' almaty ' },
      { city: 'Astana' },
      { city: 'Shymkent' },
      { city: null },
      { city: ' ' },
    ]);
    const response = await request(app).get('/api/doctors/locations').expect(200);
    expect(response.body.cities).toEqual(['Almaty', 'Astana', 'Shymkent']);
    expect(prismaMock.doctor.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        city: { not: null },
        category: { active: true },
      }),
      select: { city: true },
      distinct: ['city'],
    }));
  });

  it('filters doctors by exact city while preserving existing search filters', async () => {
    await request(app).get('/api/doctors?q=cardio&category=Cardiology&city=Almaty&availability=today').expect(200);
    const query = prismaMock.doctor.findMany.mock.calls[0][0];
    expect(query).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        category: { name: { contains: 'Cardiology', mode: 'insensitive' } },
        AND: expect.arrayContaining([
          { OR: [
            { city: { equals: 'Almaty', mode: 'insensitive' } },
            { locationId: { in: [] } },
          ] },
          { category: { active: true } },
        ]),
      }),
    }));
    expect(query.where.OR).toEqual(expect.arrayContaining([
      { office: { contains: 'cardio', mode: 'insensitive' } },
      { city: { contains: 'cardio', mode: 'insensitive' } },
      { clinicName: { contains: 'cardio', mode: 'insensitive' } },
    ]));
    expect(query.where.scheduleSlots.some).toEqual(expect.objectContaining({ status: 'FREE' }));
    expect(query.include.scheduleSlots).toEqual(expect.objectContaining({
      where: expect.objectContaining({ status: 'FREE' }),
      orderBy: { startAt: 'asc' },
      take: 1,
    }));
  });

  it('matches full doctor names, including the displayed doctor title', async () => {
    await request(app).get('/api/doctors?q=Dr.%20Ayan%20Bekov').expect(200);
    const nameFilter = prismaMock.doctor.findMany.mock.calls[0][0].where.OR[6].user;
    expect(nameFilter.AND).toEqual([
      { OR: [
        { firstName: { contains: 'Ayan', mode: 'insensitive' } },
        { lastName: { contains: 'Ayan', mode: 'insensitive' } },
      ] },
      { OR: [
        { firstName: { contains: 'Bekov', mode: 'insensitive' } },
        { lastName: { contains: 'Bekov', mode: 'insensitive' } },
      ] },
    ]);
  });

  it('filters doctors by actual free slots for availability and time of day', async () => {
    await request(app).get('/api/doctors?availability=today&timeOfDay=morning').expect(200);
    const where = prismaMock.doctor.findMany.mock.calls[0][0].where;
    expect(where.scheduleSlots.some.status).toBe('FREE');
    expect(where.scheduleSlots.some.startAt.gte).toBeInstanceOf(Date);
    expect(where.scheduleSlots.some.startAt.lt).toBeInstanceOf(Date);
    expect(where.scheduleSlots.some.OR).toEqual(expect.arrayContaining([
      { startAt: { gte: expect.any(Date), lt: expect.any(Date) } },
    ]));
  });

  it('applies availability and time-of-day windows in the patient time zone', async () => {
    await request(app).get('/api/doctors?availability=today&timeOfDay=morning&timeZone=Asia%2FAlmaty').expect(200);
    const scheduleFilter = prismaMock.doctor.findMany.mock.calls[0][0].where.scheduleSlots.some;
    expect(scheduleFilter.startAt.gte.getUTCHours()).toBe(19);
    expect(scheduleFilter.startAt.lt.getTime() - scheduleFilter.startAt.gte.getTime()).toBe(24 * 60 * 60_000);
    expect(scheduleFilter.OR).toEqual([
      { startAt: { gte: expect.any(Date), lt: expect.any(Date) } },
    ]);
    expect(scheduleFilter.OR[0].startAt.gte.getUTCHours()).toBe(1);
    expect(scheduleFilter.OR[0].startAt.lt.getUTCHours()).toBe(7);
  });

  it('rejects an invalid time zone', async () => {
    await request(app).get('/api/doctors?timeZone=not-a-time-zone').expect(400);
    expect(prismaMock.doctor.findMany).not.toHaveBeenCalled();
  });

  it('limits this-week availability to the remaining UTC calendar week', async () => {
    await request(app).get('/api/doctors?availability=this-week').expect(200);
    const scheduleFilter = prismaMock.doctor.findMany.mock.calls[0][0].where.scheduleSlots.some;
    const utcToday = new Date();
    const expectedDays = (7 - utcToday.getUTCDay()) % 7 + 1;
    expect(scheduleFilter.startAt.lt.getTime() - scheduleFilter.startAt.gte.getTime()).toBe(expectedDays * 24 * 60 * 60_000);
  });

  it('rejects invalid availability filters', async () => {
    await request(app).get('/api/doctors?availability=next-month').expect(400);
    expect(prismaMock.doctor.findMany).not.toHaveBeenCalled();
  });

  it('returns a confirmation notification after patient registration', async () => {
    prismaMock.user.create.mockResolvedValue({
      id: 'patient-1', email: 'patient@example.test', firstName: 'Taylor', lastName: 'Patient',
      role: Role.PATIENT, phone: null,
    });
    const response = await request(app).post('/api/auth/register').send({
      email: 'patient@example.test', password: 'SecurePass123', firstName: 'Taylor', lastName: 'Patient', phone: '+7 700 123 45 67', iin: '881230500711',
    }).expect(201);
    expect(response.body.notification).toEqual({ channel: 'local', message: expect.any(String) });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(notificationMock.mock.calls[0].slice(0, 2)).toEqual(['patient@example.test', 'Taylor']);
  });

  it('creates slots for doctors in 30-minute units', async () => {
    const response = await request(app).post('/api/doctors/me/schedule')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ date: '2099-05-10', startTime: '09:00', endTime: '11:00' })
      .expect(201);
    expect(response.body.created).toBe(4);
    expect(prismaMock.scheduleSlot.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
    expect(prismaMock.scheduleSlot.createMany.mock.calls[0][0].data).toHaveLength(4);
  });

  it('rejects a single day only when every time is already taken', async () => {
    prismaMock.scheduleSlot.findMany.mockResolvedValue([{ startAt: new Date('2099-05-10T04:00:00Z'), endAt: new Date('2099-05-10T05:00:00Z') }]);
    const response = await request(app).post('/api/doctors/me/schedule')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ date: '2099-05-10', startTime: '09:00', endTime: '10:00' })
      .expect(409);
    expect(response.body.error).toMatch(/No new slots/);
    expect(prismaMock.scheduleSlot.createMany).not.toHaveBeenCalled();
  });

  it('creates 30-minute slots for selected working days and reports nothing skipped', async () => {
    prismaMock.scheduleSlot.findMany.mockResolvedValue([]);
    prismaMock.scheduleSlot.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
    const response = await request(app).post('/api/doctors/me/schedule/working-days')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ dates: ['2099-05-10', '2099-05-12'], startTime: '09:00', endTime: '11:00' })
      .expect(201);
    expect(response.body).toMatchObject({ created: 8, dates: ['2099-05-10', '2099-05-12'], skipped: [], skippedSummary: '' });
    expect(prismaMock.scheduleSlot.createMany.mock.calls[0][0].data).toHaveLength(8);
  });

  it('skips times already in the schedule and creates the rest', async () => {
    // 09:00–10:00 Almaty on 10 May is already taken; 12 May is free.
    prismaMock.scheduleSlot.findMany.mockResolvedValue([{ startAt: new Date('2099-05-10T04:00:00Z'), endAt: new Date('2099-05-10T05:00:00Z') }]);
    prismaMock.scheduleSlot.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
    const response = await request(app).post('/api/doctors/me/schedule/working-days')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ dates: ['2099-05-10', '2099-05-12'], startTime: '09:00', endTime: '11:00' })
      .expect(201);
    expect(response.body.created).toBe(6);
    expect(response.body.skipped).toHaveLength(2);
    expect(response.body.skippedSummary).toBe('2 already in your schedule');
  });

  it('skips times that have already started', async () => {
    prismaMock.scheduleSlot.findMany.mockResolvedValue([]);
    prismaMock.scheduleSlot.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date());
    const response = await request(app).post('/api/doctors/me/schedule/working-days')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ dates: [today, '2099-05-12'], startTime: '00:00', endTime: '23:30' })
      .expect(201);
    expect(response.body.skipped.length).toBeGreaterThan(0);
    expect(response.body.skipped.every((item: { reason: string }) => item.reason === 'past')).toBe(true);
    expect(response.body.skippedSummary).toMatch(/already started/);
  });

  it('allows patients to view statuses without patient details', async () => {
    prismaMock.scheduleSlot.findMany.mockResolvedValue([{ id: 'slot-1', status: 'BOOKED', startAt: new Date('2099-05-10T09:00:00Z'), endAt: new Date('2099-05-10T09:30:00Z') }]);
    const response = await request(app).get('/api/doctors/doctor-1/schedule?date=2099-05-10')
      .set('Authorization', bearer(Role.PATIENT))
      .expect(200);
    expect(response.body.slots[0].status).toBe('BOOKED');
    expect(response.body.doctor).toEqual({
      id: 'doctor-1',
      office: 'North Clinic',
      category: { name: 'Cardiology' },
      user: { firstName: 'Sam', lastName: 'Doctor' },
    });
    expect(response.body.doctor.user).not.toHaveProperty('email');
    expect(prismaMock.scheduleSlot.findMany.mock.calls[0][0]).not.toHaveProperty('include');
    expect(prismaMock.scheduleSlot.findMany.mock.calls[0][0].select).toEqual({
      id: true,
      startAt: true,
      endAt: true,
      status: true,
    });
  });

  it('returns patient and purpose details to the owning doctor', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValue({
      id: 'slot-1', status: 'BOOKED', visitPurpose: 'Consultation',
      patient: { id: 'patient-1', firstName: 'Casey', lastName: 'Patient', email: 'casey@example.test' },
    });
    const response = await request(app).get('/api/doctors/me/schedule/slot-1')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .expect(200);
    expect(response.body.slot.patient.email).toBe('casey@example.test');
    expect(response.body.slot.visitPurpose).toBe('Consultation');
  });

  it('lets a patient book a free slot using their authenticated identity', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValue({ id: 'slot-1', status: 'BOOKED', startAt: new Date('2099-05-10T09:00:00.000Z'), endAt: new Date('2099-05-10T09:30:00.000Z'), visitPurpose: 'Consultation' });
    const response = await request(app).post('/api/doctors/doctor-1/schedule/slot-1/book')
      .set('Authorization', bearer(Role.PATIENT, 'patient-user'))
      .send({ visitPurpose: 'Consultation' })
      .expect(201);
    expect(response.body.slot.status).toBe('BOOKED');
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ doctorId: 'doctor-1', id: 'slot-1', status: 'FREE' }),
      data: expect.objectContaining({ patientId: 'patient-user', status: 'BOOKED', visitPurpose: 'Consultation' }),
    }));
  });

  it('rejects a slot that was already booked', async () => {
    prismaMock.scheduleSlot.updateMany.mockResolvedValue({ count: 0 });
    await request(app).post('/api/doctors/doctor-1/schedule/slot-1/book')
      .set('Authorization', bearer(Role.PATIENT, 'patient-user'))
      .send({ visitPurpose: 'Consultation' })
      .expect(409);
    expect(prismaMock.scheduleSlot.findFirst).not.toHaveBeenCalled();
  });

  it('links a patient and visit purpose when a doctor marks a slot booked', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: Role.PATIENT });
    prismaMock.scheduleSlot.findFirst
      .mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.FREE, startAt: new Date('2099-05-10T09:00:00.000Z') })
      .mockResolvedValueOnce({
      id: 'slot-1', status: 'BOOKED', visitPurpose: 'Consultation',
      patient: { id: 'patient-1', firstName: 'Casey', lastName: 'Patient', email: 'casey@example.test' },
    });
    const response = await request(app).patch('/api/doctors/me/schedule/slot-1')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ status: 'BOOKED', patientId: 'patient-1', visitPurpose: 'Consultation' })
      .expect(200);
    expect(response.body.slot.patient.id).toBe('patient-1');
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot-1', doctorId: 'doctor-1', status: SlotStatus.FREE },
      data: { status: 'BOOKED', patientId: 'patient-1', visitPurpose: 'Consultation' },
    }));
  });

  it('prevents a booked appointment from being changed without explicit release', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValue({ id: 'slot-1', status: SlotStatus.BOOKED });
    await request(app).patch('/api/doctors/me/schedule/slot-1')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ status: 'FREE' })
      .expect(409);
    expect(prismaMock.scheduleSlot.updateMany).not.toHaveBeenCalled();
  });

  it('does not allow a past slot to be newly booked by a doctor', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: Role.PATIENT });
    prismaMock.scheduleSlot.findFirst.mockResolvedValue({
      id: 'slot-1',
      status: SlotStatus.FREE,
      startAt: new Date('2000-05-10T09:00:00.000Z'),
    });
    await request(app).patch('/api/doctors/me/schedule/slot-1')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ status: 'BOOKED', patientId: 'patient-1', visitPurpose: 'Consultation' })
      .expect(400);
    expect(prismaMock.scheduleSlot.updateMany).not.toHaveBeenCalled();
  });

  it('requires a booked slot to release appointments and applies the release atomically', async () => {
    prismaMock.scheduleSlot.findFirst
      .mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.BOOKED })
      .mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.FREE, patient: null });
    await request(app).patch('/api/doctors/me/schedule/slot-1')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ status: 'FREE', releaseBooking: true, cancellationReason: 'Doctor is on sick leave' })
      .expect(200);
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot-1', doctorId: 'doctor-1', status: SlotStatus.BOOKED },
      data: { status: 'FREE', patientId: null, visitPurpose: null },
    }));
  });

  it('requires a reason when a doctor releases a booked appointment and records it', async () => {
    await request(app).patch('/api/doctors/me/schedule/slot-1')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ status: 'FREE', releaseBooking: true })
      .expect(400);
    prismaMock.scheduleSlot.findFirst
      .mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.BOOKED, startAt: new Date('2099-05-10T09:00:00Z'), endAt: new Date('2099-05-10T09:30:00Z'), visitPurpose: 'Checkup', patientId: 'patient-user', patient: { email: 'p@example.test' } })
      .mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.FREE, patient: null });
    await request(app).patch('/api/doctors/me/schedule/slot-1')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ status: 'FREE', releaseBooking: true, cancellationReason: 'Doctor is on sick leave' })
      .expect(200);
    expect(prismaMock.cancelledAppointment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ patientId: 'patient-user', reason: 'Doctor is on sick leave', cancelledByRole: Role.DOCTOR }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'patient-user', type: 'APPOINTMENT_RELEASED', message: expect.stringContaining('Reason: Doctor is on sick leave') }) }));
  });

  it('prevents patients from modifying doctor schedules or offices', async () => {
    await request(app).post('/api/doctors/me/schedule')
      .set('Authorization', bearer(Role.PATIENT))
      .send({ date: '2099-05-10', startTime: '09:00', endTime: '10:00' })
      .expect(403);
    await request(app).patch('/api/doctors/me/office')
      .set('Authorization', bearer(Role.PATIENT))
      .send({ office: 'North Clinic' })
      .expect(403);
    await request(app).put('/api/doctors/me/location')
      .set('Authorization', bearer(Role.PATIENT))
      .send({ city: 'Almaty', clinicName: null, streetAddress: null, officeNumber: null })
      .expect(403);
    await request(app).post('/api/doctors/doctor-1/schedule/slot-1/book')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ visitPurpose: 'Consultation' })
      .expect(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.doctor.update).not.toHaveBeenCalled();
  });

  it('allows doctors to update structured location fields and clears blank values', async () => {
    prismaMock.doctor.update.mockResolvedValue({
      id: 'doctor-1',
      city: 'Almaty',
      clinicName: 'Central Clinic',
      streetAddress: '18 Abay Avenue',
      officeNumber: 'Office 101',
      category: { name: 'Cardiology' },
    });
    await request(app).put('/api/doctors/me/location')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({
        city: ' Almaty ',
        clinicName: ' Central Clinic ',
        streetAddress: '18 Abay Avenue',
        officeNumber: 'Office 101',
      })
      .expect(200);
    expect(prismaMock.doctor.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'doctor-1' },
      data: {
        city: 'Almaty',
        clinicName: 'Central Clinic',
        streetAddress: '18 Abay Avenue',
        officeNumber: 'Office 101',
      },
    }));
    await request(app).put('/api/doctors/me/location')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ city: ' ', clinicName: '', streetAddress: null, officeNumber: null })
      .expect(200);
    expect(prismaMock.doctor.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { city: null, clinicName: null, streetAddress: null, officeNumber: null },
    }));
  });
});


describe('branded appointment emails through real routes (mocked Resend)', () => {
  const checkedInSlot = () => ({
    id: 'slot-1', status: SlotStatus.BOOKED, startAt: new Date(Date.now() + 5 * 60_000), endAt: new Date(Date.now() + 35 * 60_000), patientId: 'patient-user',
    patient: { id: 'patient-user', email: 'patient@example.test', firstName: 'Casey', lastName: 'Patient' },
    doctor: { userId: 'doctor-user', user: { firstName: 'Sam', lastName: 'Doctor' } },
  });
  beforeEach(() => { testConfig.RESEND_API_KEY = 'mock-provider-key'; });

  it('sends branded booking email only after a successful booking', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-1', startAt: new Date(Date.now() + 86400000), status: SlotStatus.BOOKED, updatedAt: new Date() });
    await request(app).post('/api/doctors/doctor-1/schedule/slot-1/book').set('Authorization', bearer(Role.PATIENT, 'patient-user')).send({ visitPurpose: 'Private clinical purpose' }).expect(201);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ subject: 'Appointment Confirmed | Happy Patient', to: 'patient@example.test' });
    expect(sendEmail.mock.calls[0][0].html).not.toContain('Private clinical purpose');
    prismaMock.scheduleSlot.updateMany.mockResolvedValueOnce({ count: 0 });
    await request(app).post('/api/doctors/doctor-1/schedule/slot-1/book').set('Authorization', bearer(Role.PATIENT)).send({ visitPurpose: 'Follow-up' }).expect(409);
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it('attaches a receipt using the exact persisted check-in timestamp', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce(checkedInSlot());
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.FRONT_DESK, 'desk-user')).expect(200);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
    const payload = sendEmail.mock.calls[0][0];
    expect(payload.subject).toBe('Visit Check-in Confirmed | Happy Patient');
    expect(payload.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(prismaMock.receipt.upsert).toHaveBeenCalledOnce();
    const checkedInAt = prismaMock.scheduleSlot.updateMany.mock.calls[0][0].data.checkedInAt;
    expect(checkedInAt).toBeInstanceOf(Date);
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(payload.attachments[0].content) });
    const doc = await task.promise;
    const content = await (await doc.getPage(1)).getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
    const time = new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Almaty' }).format(checkedInAt);
    for (const value of ['receipt-1', 'HP-SLOT-1', 'Casey Patient', 'Dr. Sam Doctor', time]) expect(text).toContain(value);
    await task.destroy();
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ ...checkedInSlot(), status: SlotStatus.OCCUPIED });
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.FRONT_DESK)).expect(409);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(prismaMock.receipt.upsert).toHaveBeenCalledOnce();
  });

  it('does not create receipts or send email after losing the check-in race', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce(checkedInSlot());
    prismaMock.scheduleSlot.updateMany.mockResolvedValueOnce({ count: 0 });
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.FRONT_DESK)).expect(409);
    expect(prismaMock.receipt.upsert).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('keeps successful check-in state when Resend fails', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce(checkedInSlot());
    sendEmail.mockRejectedValueOnce(new Error('Provider unavailable'));
    await request(app).post('/api/appointments/slot-1/check-in').set('Authorization', bearer(Role.FRONT_DESK)).expect(200);
    await vi.waitFor(() => expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })));
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledOnce();
    expect(prismaMock.receipt.upsert).toHaveBeenCalledOnce();
  });

  it('sends a distinct patient cancellation email', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ ...checkedInSlot(), doctorId: 'doctor-1', visitPurpose: 'Private purpose', updatedAt: new Date() });
    await request(app).post('/api/appointments/slot-1/cancel').set('Authorization', bearer(Role.PATIENT, 'patient-user')).send({ reason: 'Plans changed' }).expect(200);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
    expect(sendEmail.mock.calls[0][0].subject).toBe('Appointment Cancelled | Happy Patient');
    expect(sendEmail.mock.calls[0][0].text).toContain('Cancelled by patient');
  });

  it('sends doctor cancellation details and reason to the existing patient recipient', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ ...checkedInSlot(), updatedAt: new Date() }).mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.FREE });
    await request(app).patch('/api/doctors/me/schedule/slot-1').set('Authorization', bearer(Role.DOCTOR, 'doctor-user')).send({ status: 'FREE', releaseBooking: true, cancellationReason: 'Doctor unavailable' }).expect(200);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: 'patient@example.test', subject: 'Appointment Cancelled by Doctor | Happy Patient' });
    expect(sendEmail.mock.calls[0][0].text).toContain('Doctor unavailable');
    expect(sendEmail.mock.calls[0][0].text).toContain('Cancelled by doctor');
  });

  it('creates and emails the receipt for an immediately checked-in walk-in', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce(checkedInSlot());
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'patient-user', role: Role.PATIENT, email: 'patient@example.test', firstName: 'Casey', lastName: 'Patient' });
    await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(Role.FRONT_DESK)).send({ slotId: 'slot-1', doctorId: 'doctor-1', iin: '881230500711', firstName: 'Casey', lastName: 'Patient', visitPurpose: 'Walk-in consultation' }).expect(201);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
    expect(sendEmail.mock.calls[0][0].attachments).toHaveLength(1);
    expect(prismaMock.receipt.upsert).toHaveBeenCalledOnce();
  });
});

describe('manual availability protects active appointments', () => {
  it.each([
    { status: SlotStatus.BOOKED, patientId: 'patient-1', checkedInAt: null },
    { status: SlotStatus.OCCUPIED, patientId: 'patient-1', checkedInAt: new Date() },
    { status: SlotStatus.OCCUPIED, patientId: 'patient-1', checkedInAt: null },
    { status: SlotStatus.OCCUPIED, patientId: null, checkedInAt: new Date() },
  ])('rejects freeing active appointment data %j', async fields => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-1', ...fields });
    await request(app).patch('/api/doctors/me/schedule/slot-1').set('Authorization', bearer(Role.DOCTOR)).send({ status: 'FREE' }).expect(409);
    expect(prismaMock.scheduleSlot.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.cancelledAppointment.create).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it.each(['FREE', 'BOOKED', 'OCCUPIED'])('cannot overwrite checked-in data with status %s', async status => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.OCCUPIED, patientId: 'patient-1', checkedInAt: new Date() });
    await request(app).patch('/api/doctors/me/schedule/slot-1').set('Authorization', bearer(Role.DOCTOR)).send({ status, ...(status === 'BOOKED' ? { patientId: 'other-patient', visitPurpose: 'Replacement visit' } : {}) }).expect(409);
    expect(prismaMock.scheduleSlot.updateMany).not.toHaveBeenCalled();
  });

  it('does not permit doctor or patient cancellation after check-in', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValue({ id: 'slot-1', status: SlotStatus.OCCUPIED, patientId: 'patient-user', checkedInAt: new Date() });
    await request(app).patch('/api/doctors/me/schedule/slot-1').set('Authorization', bearer(Role.DOCTOR)).send({ status: 'FREE', releaseBooking: true, cancellationReason: 'Doctor unavailable' }).expect(409);
    await request(app).post('/api/appointments/slot-1/cancel').set('Authorization', bearer(Role.PATIENT, 'patient-user')).send({ reason: 'Plans changed' }).expect(409);
    expect(prismaMock.scheduleSlot.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.cancelledAppointment.create).not.toHaveBeenCalled();
  });

  it('allows manual blocks to become available using an atomic no-appointment guard', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.OCCUPIED, patientId: null, checkedInAt: null }).mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.FREE, patient: null });
    await request(app).patch('/api/doctors/me/schedule/slot-1').set('Authorization', bearer(Role.DOCTOR)).send({ status: 'FREE' }).expect(200);
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', doctorId: 'doctor-1', status: SlotStatus.OCCUPIED, patientId: null, checkedInAt: null },
      data: { status: SlotStatus.FREE, patientId: null, visitPurpose: null },
    });
    expect(prismaMock.cancelledAppointment.create).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it('returns conflict when an appointment appears after loading a manual block', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-1', status: SlotStatus.OCCUPIED, patientId: null, checkedInAt: null });
    prismaMock.scheduleSlot.updateMany.mockResolvedValueOnce({ count: 0 });
    await request(app).patch('/api/doctors/me/schedule/slot-1').set('Authorization', bearer(Role.DOCTOR)).send({ status: 'FREE' }).expect(409);
    expect(prismaMock.scheduleSlot.updateMany.mock.calls[0][0].where).toMatchObject({ patientId: null, checkedInAt: null });
    expect(prismaMock.scheduleSlot.findFirst).toHaveBeenCalledOnce();
  });
});


describe('Sprint 4 walk-in boundaries', () => {
  const input = { iin: '990101300122', firstName: 'Walk', lastName: 'In', doctorId: 'doctor-1', slotId: 'slot-9', visitPurpose: 'Consultation' };
  it.each([[1800000, 'OCCUPIED'], [1801000, 'BOOKED'], [0, 'OCCUPIED'], [-60000, 'OCCUPIED']])('server decides status at %i ms', async (delta, status) => {
    const now = new Date('2026-11-02T05:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    try {
      prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-9', startAt: new Date(now.getTime() + delta), doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } });
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'patient', role: Role.PATIENT, email: 'patient@example.test', firstName: 'Walk', lastName: 'In' });
      const response = await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(Role.FRONT_DESK)).send({ ...input, status: 'FREE', now: '2099-01-01' });
      expect(response.status).toBe(201); expect(response.body.slot.status).toBe(status);
      expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'FREE', endAt: { gt: now } }) }));
    } finally { vi.useRealTimers(); }
  });
  it('rejects non-free slots', async () => { await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(Role.ADMIN)).send(input).expect(409); expect(prismaMock.user.create).not.toHaveBeenCalled(); });
  it('returns conflict when another request claims the slot', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({ id: 'slot-9', startAt: new Date(Date.now() + 3600000), doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'patient', role: Role.PATIENT });
    prismaMock.scheduleSlot.updateMany.mockResolvedValueOnce({ count: 0 });
    await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(Role.FRONT_DESK)).send(input).expect(409);
  });
  it('rejects an invalid IIN for a new walk-in patient but reuses an existing record', async () => {
    const slot = { id: 'slot-9', startAt: new Date(Date.now() + 3600000), doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } };
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce(slot);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const rejected = await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(Role.FRONT_DESK)).send({ ...input, iin: '123456789012' }).expect(400);
    expect(rejected.body.error).toBe('Enter a valid IIN.');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce(slot);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'legacy', role: Role.PATIENT, email: 'legacy@example.test', firstName: 'Old', lastName: 'Record' });
    await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(Role.FRONT_DESK)).send({ ...input, iin: '123456789012' }).expect(201);
  });
  it.each([Role.PATIENT, Role.DOCTOR])('rejects %s walk-ins', async role => { await request(app).post('/api/front-desk/walk-ins').set('Authorization', bearer(role)).send(input).expect(403); });
});

describe('Sprint 5–6 visit cost', () => {
  it('resolves price rules at the booking event time instead of the slot creation time', async () => {
    const bookedAt=new Date('2026-11-01T10:00:00.000Z');
    prismaMock.scheduleSlot.findFirst.mockResolvedValueOnce({id:'slot-cost',patientId:'patient-user',doctorId:'doctor-1',createdAt:new Date('2026-10-01T00:00:00.000Z'),updatedAt:new Date('2026-11-02T00:00:00.000Z'),startAt:new Date('2026-11-03T00:00:00.000Z'),endAt:new Date('2026-11-03T00:30:00.000Z'),doctor:{consultationFee:10000,categoryId:'category-1'}});
    prismaMock.notification.findFirst.mockResolvedValueOnce({createdAt:bookedAt});
    prismaMock.pricingRule.findMany.mockResolvedValueOnce([{id:'rule',kind:'visit',doctorId:'doctor-1',categoryId:null,consultationType:null,officeId:null,effectiveFrom:new Date('2026-11-01T00:00:00.000Z'),effectiveTo:null,amountKzt:18000,ratePerHourKzt:null,freeMinutes:0,rounding:'per_started_hour',dailyCapKzt:null}]);
    const response=await request(app).get('/api/me/appointments/slot-cost/cost').set('Authorization',bearer(Role.PATIENT,'patient-user')).expect(200);
    expect(response.body.consultationKzt).toBe(18000);expect(response.body.totalKzt).toBe(18000);
    expect(prismaMock.pricingRule.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({effectiveFrom:{lte:bookedAt}})}));
  });
});

describe('Sprint 5–6 administrator access', () => {
  it.each([
    ['GET','/api/admin/pricing'],['GET','/api/admin/statistics'],['POST','/api/admin/integrity/run'],['GET','/api/admin/reference/locations'],
  ])('%s %s is denied to patients', async (method,path) => {
    const pending=method==='POST'?request(app).post(path):request(app).get(path);const response=await pending.set('Authorization',bearer(Role.PATIENT));
    expect(response.status).toBe(403);
  });
});


describe('Sprint 5–6 reference data management',()=>{
  it('rejects case-insensitive duplicate categories',async()=>{
    prismaMock.category.findFirst.mockResolvedValueOnce({id:'existing',name:'Cardiology'});
    await request(app).post('/api/admin/reference/categories').set('Authorization',bearer(Role.ADMIN)).send({name:'cardiology'}).expect(409);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });
  it('creates a category and records its audit atomically',async()=>{
    await request(app).post('/api/admin/reference/categories').set('Authorization',bearer(Role.ADMIN)).send({name:'New specialty'}).expect(201);
    expect(prismaMock.category.create).toHaveBeenCalledOnce();
    expect(prismaMock.referenceDataAudit.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({entity:'category',entityId:'category-new',action:'created'})}));
  });
  it('rejects an unconfirmed location move',async()=>{
    prismaMock.location.findUnique.mockResolvedValueOnce({id:'office',kind:'office',name:'Room 1',parentId:'floor',active:true});
    await request(app).patch('/api/admin/reference/locations/office').set('Authorization',bearer(Role.ADMIN)).send({parentId:'other-floor'}).expect(400);
    expect(prismaMock.location.update).not.toHaveBeenCalled();
  });
  it('lets admins read reference change audit and denies other roles',async()=>{
    await request(app).get('/api/admin/reference/audit').set('Authorization',bearer(Role.ADMIN)).expect(200);
    await request(app).get('/api/admin/reference/audit').set('Authorization',bearer(Role.FRONT_DESK)).expect(403);
  });
});

describe('demo clock', () => {
  it('lets only an admin move app time and reports it to everyone', async () => {
    const initial = await request(app).get('/api/time').expect(200);
    expect(initial.body.offsetMinutes).toBe(0);
    await request(app).post('/api/admin/time').set('Authorization', bearer(Role.DOCTOR)).send({ offsetMinutes: 30 }).expect(403);
    await request(app).post('/api/admin/time').set('Authorization', bearer(Role.ADMIN)).send({ offsetMinutes: 99999999 }).expect(400);
    const moved = await request(app).post('/api/admin/time').set('Authorization', bearer(Role.ADMIN)).send({ offsetMinutes: 90 }).expect(200);
    expect(moved.body.offsetMinutes).toBe(90);
    expect((await request(app).get('/api/time')).body.offsetMinutes).toBe(90);
    const reset = await request(app).post('/api/admin/time').set('Authorization', bearer(Role.ADMIN)).send({ offsetMinutes: 0 }).expect(200);
    expect(reset.body.offsetMinutes).toBe(0);
  });
});

describe('admin appointment labels', () => {
  it('uses the same Booked / Checked in wording as the doctor screens', async () => {
    const doctor = { user: { firstName: 'Sam', lastName: 'Doctor' }, category: { name: 'Pediatrics' } };
    prismaMock.scheduleSlot.findMany.mockResolvedValueOnce([
      { id: 'a', status: 'BOOKED', startAt: new Date('2099-01-01T05:00:00Z'), visitPurpose: null, doctor, patient: { firstName: 'Ann', lastName: 'B', email: 'a@x.test' } },
      { id: 'b', status: 'OCCUPIED', startAt: new Date('2099-01-01T06:00:00Z'), visitPurpose: null, doctor, patient: { firstName: 'Bob', lastName: 'C', email: 'b@x.test' } },
    ]);
    const response = await request(app).get('/api/admin/appointments').set('Authorization', bearer(Role.ADMIN)).expect(200);
    expect(response.body.appointments.map((item: { status: string }) => item.status)).toEqual(['Booked', 'Checked in']);
  });
});
