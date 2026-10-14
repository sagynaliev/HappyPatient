import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role, SlotStatus } from '@prisma/client';

const prismaMock = vi.hoisted(() => ({
  doctor: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  scheduleSlot: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const notificationMock = vi.hoisted(() => vi.fn());

vi.mock('./prisma', () => ({ prisma: prismaMock }));
vi.mock('./registrationNotification', () => ({ sendRegistrationConfirmation: notificationMock }));

let app: (typeof import('./app'))['app'];
let signToken: (user: { id: string; email: string; role: Role }) => string;

beforeAll(async () => {
  process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
  process.env.JWT_SECRET ||= 'test-secret-with-at-least-16-chars';
  ({ app } = await import('./app.js'));
  ({ signToken } = await import('./auth.js'));
});

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.doctor.findMany.mockResolvedValue([]);
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
    phone: '+7 700 111 22 33', iin: '123456789012', createdAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  notificationMock.mockResolvedValue({ channel: 'local', message: 'Confirmation notification recorded for local development.' });
  prismaMock.$transaction.mockImplementation(async (callback) => callback({ scheduleSlot: prismaMock.scheduleSlot }));
});

const bearer = (role: Role, id = `${role.toLowerCase()}-user`) => `Bearer ${signToken({ id, email: `${role.toLowerCase()}@example.test`, role })}`;

describe('authenticated self profile endpoints', () => {
  it('returns account details with a masked IIN and creation date', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'patient-user', email: 'patient@example.test', firstName: 'Casey', lastName: 'Patient', role: Role.PATIENT,
      phone: '+7 700 111 22 33', iin: '123456789012', createdAt: new Date('2026-10-01T00:00:00.000Z'),
    });
    const response = await request(app).get('/api/me').set('Authorization', bearer(Role.PATIENT, 'patient-user')).expect(200);
    expect(response.body.user.maskedIin).toBe('••••••••••12');
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
    expect(response.body.user.maskedIin).toBe('••••••••••12');
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
        doctor: {
          select: {
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
      where: { city: { not: null } },
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
        city: { equals: 'Almaty', mode: 'insensitive' },
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
      email: 'patient@example.test', password: 'SecurePass123', firstName: 'Taylor', lastName: 'Patient', iin: '123456789012',
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

  it('rejects overlapping schedules with a conflict response', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValue({ id: 'existing-slot' });
    await request(app).post('/api/doctors/me/schedule')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({ date: '2099-05-10', startTime: '09:00', endTime: '10:00' })
      .expect(409);
    expect(prismaMock.scheduleSlot.createMany).not.toHaveBeenCalled();
  });

  it('creates 30-minute slots for selected working days as one transaction', async () => {
    prismaMock.scheduleSlot.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
    const response = await request(app).post('/api/doctors/me/schedule/working-days')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({
        dates: ['2099-05-10', '2099-05-12'],
        startTime: '09:00',
        endTime: '11:00',
      })
      .expect(201);
    expect(response.body).toEqual({ created: 8, dates: ['2099-05-10', '2099-05-12'] });
    const overlapQuery = prismaMock.scheduleSlot.findFirst.mock.calls[0][0];
    expect(overlapQuery.where.OR).toHaveLength(2);
    expect(prismaMock.scheduleSlot.createMany.mock.calls[0][0].data).toHaveLength(8);
  });

  it('does not create any working-day slots if one date overlaps', async () => {
    prismaMock.scheduleSlot.findFirst.mockResolvedValue({ id: 'existing-slot' });
    await request(app).post('/api/doctors/me/schedule/working-days')
      .set('Authorization', bearer(Role.DOCTOR, 'doctor-user'))
      .send({
        dates: ['2099-05-10', '2099-05-12'],
        startTime: '09:00',
        endTime: '11:00',
      })
      .expect(409);
    expect(prismaMock.scheduleSlot.createMany).not.toHaveBeenCalled();
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
    prismaMock.scheduleSlot.findFirst.mockResolvedValue({ id: 'slot-1', status: 'BOOKED', visitPurpose: 'Consultation' });
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
      .send({ status: 'FREE', releaseBooking: true })
      .expect(200);
    expect(prismaMock.scheduleSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot-1', doctorId: 'doctor-1', status: SlotStatus.BOOKED },
      data: { status: 'FREE', patientId: null, visitPurpose: null },
    }));
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
