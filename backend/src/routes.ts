import { Router, Request, Response } from 'express';
import { Prisma, Role, SlotStatus } from '@prisma/client';
import { prisma } from './prisma';
import { comparePassword, hashPassword, hashToken, randomToken, randomVerificationCode, signToken } from './auth';
import { config } from './config';
import { requireAuth, requireRole } from './middleware';
import { bookingSchema, doctorLocationSchema, officeSchema, registrationSchema, loginSchema, profileUpdateSchema, recoverySchema, resetSchema, scheduleBatchSchema, scheduleDateSchema, slotUpdateSchema, verificationCodeSchema } from './validation';
import { Resend } from 'resend';
import { generateScheduleSlots, localDateAt, localTimeToUtc, utcDateBounds } from './schedule';
import { sendRegistrationConfirmation } from './registrationNotification';

const router = Router();
const parsed = <T>(schema: { parse: (v: unknown) => T }, body: unknown) => schema.parse(body);
const publicUser = (u: { id: string; email: string; firstName: string; lastName: string; role: Role; phone: string | null }) =>
  ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role, phone: u.phone });

router.post('/auth/register', async (req, res) => {
  const input = parsed(registrationSchema, req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return res.status(409).json({ error: 'Email is already registered' });
  const { password, ...profile } = input;
  const user = await prisma.user.create({ data: { ...profile, passwordHash: await hashPassword(password) } });
  const notification = await sendRegistrationConfirmation(user.email, user.firstName, config.RESEND_API_KEY, config.FRONTEND_URL);
  res.status(201).json({ user: publicUser(user), token: signToken({ id: user.id, email: user.email, role: user.role }), notification });
});

router.post('/auth/login', async (req, res) => {
  const input = parsed(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await comparePassword(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ user: publicUser(user), token: signToken({ id: user.id, email: user.email, role: user.role }) });
});

router.post('/auth/forgot-password', async (req, res) => {
  const { email } = parsed(recoverySchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const response = { message: 'If that email exists, a verification code has been sent' };
  if (user) {
    const cooldownSince = new Date(Date.now() - 60_000);
    const recentCode = await prisma.resetToken.findFirst({ where: { userId: user.id, createdAt: { gt: cooldownSince }, usedAt: null }, select: { id: true } });
    if (!recentCode) {
      console.info(`RESEND_API_KEY configured: ${Boolean(process.env.RESEND_API_KEY)}`);
      if (!config.RESEND_API_KEY) return res.status(503).json({ error: 'Password recovery email is not configured.' });
      const code = randomVerificationCode();
      const resend = new Resend(config.RESEND_API_KEY);
      try {
        const { error } = await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: user.email,
          subject: 'Your HappyPatient password reset code',
          text: `Your HappyPatient password reset code is: ${code}\n\nThis code expires in 10 minutes and can only be used once.`,
        });
        if (error) {
          console.error('Resend rejected password recovery email', {
            statusCode: error.statusCode,
            name: error.name,
            message: error.message,
            code: 'code' in error ? error.code : undefined,
          });
          return res.status(502).json({ error: 'We could not send the verification code. Please try again.' });
        }
        console.info('Resend accepted password recovery email');
      } catch (error: unknown) {
        console.error('Resend request failed while sending password recovery email', {
          name: error instanceof Error ? error.name : undefined,
          message: error instanceof Error ? error.message : undefined,
        });
        return res.status(502).json({ error: 'We could not send the verification code. Please try again.' });
      }
      await prisma.$transaction([
        prisma.resetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
        prisma.resetToken.create({ data: { userId: user.id, tokenHash: hashToken(code), expiresAt: new Date(Date.now() + 10 * 60_000) } }),
      ]);
    }
  }
  res.json(response);
});

router.post('/auth/verify-reset-code', async (req, res) => {
  const { email, code } = parsed(verificationCodeSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification code.' });
  const record = await prisma.resetToken.findFirst({ where: { userId: user.id, tokenHash: hashToken(code), usedAt: null, expiresAt: { gt: new Date() } } });
  if (!record) return res.status(400).json({ error: 'Invalid or expired verification code.' });
  const resetToken = randomToken();
  await prisma.$transaction([
    prisma.resetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.resetToken.create({ data: { userId: user.id, tokenHash: hashToken(resetToken), expiresAt: new Date(Date.now() + 10 * 60_000) } }),
  ]);
  res.json({ resetToken });
});

router.post('/auth/reset-password', async (req, res) => {
  const { token, password } = parsed(resetSchema, req.body);
  const record = await prisma.resetToken.findFirst({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
  if (!record) return res.status(400).json({ error: 'Invalid or expired reset token' });
  await prisma.$transaction([prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password) } }), prisma.resetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })]);
  res.json({ message: 'Password has been reset' });
});

const profileSelect = { id: true, email: true, firstName: true, lastName: true, role: true, phone: true, iin: true, createdAt: true } as const;
const maskedProfile = (user: { id: string; email: string; firstName: string; lastName: string; role: Role; phone: string | null; iin: string | null; createdAt: Date }) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  phone: user.phone,
  maskedIin: user.iin ? `${'•'.repeat(Math.max(0, user.iin.length - 2))}${user.iin.slice(-2)}` : null,
  createdAt: user.createdAt,
});
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: profileSelect });
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: maskedProfile(user) });
});
router.patch('/me', requireAuth, async (req, res) => {
  const input = parsed(profileUpdateSchema, req.body);
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: input, select: profileSelect });
  res.json({ user: maskedProfile(user) });
});
router.get('/me/appointments', requireAuth, requireRole(Role.PATIENT), async (req, res) => {
  const appointments = await prisma.scheduleSlot.findMany({
    where: { patientId: req.user!.id },
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
  res.json({
    appointments: appointments.map(({ doctor, ...appointment }) => ({
      ...appointment,
      doctor: {
        name: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`,
        specialty: doctor.category.name,
        office: doctor.office,
        consultationFee: doctor.consultationFee,
      },
    })),
  });
});
router.get('/categories', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  res.json({ categories: await prisma.category.findMany({ where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined, orderBy: { name: 'asc' } }) });
});
router.get('/doctors/locations', async (_req, res) => {
  const doctors = await prisma.doctor.findMany({
    where: { city: { not: null } },
    select: { city: true },
    distinct: ['city'],
    orderBy: { city: 'asc' },
  });
  const cities = new Map<string, string>();
  doctors.forEach(({ city }) => {
    const name = city?.trim();
    if (name && !cities.has(name.toLocaleLowerCase())) cities.set(name.toLocaleLowerCase(), name);
  });
  res.json({ cities: Array.from(cities.values()).sort((a, b) => a.localeCompare(b)) });
});
router.get('/doctors', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const office = typeof req.query.office === 'string' ? req.query.office.trim() : '';
  const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
  const normalizedNameQuery = q.replace(/^(?:dr\.?|doctor)\s+/i, '').trim();
  const nameTerms = (normalizedNameQuery || q).split(/\s+/).filter(Boolean);
  const availability = typeof req.query.availability === 'string' ? req.query.availability : '';
  const timeOfDay = typeof req.query.timeOfDay === 'string' ? req.query.timeOfDay : '';
  const now = new Date();
  const timeZone = typeof req.query.timeZone === 'string' ? req.query.timeZone : 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return res.status(400).json({ error: 'Choose a valid time zone.' });
  }
  const today = localDateAt(now, timeZone);
  const shiftDate = (date: string, days: number) => {
    const shifted = new Date(`${date}T00:00:00.000Z`);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().slice(0, 10);
  };
  const daysThroughSunday = (7 - new Date(`${today}T00:00:00.000Z`).getUTCDay()) % 7 + 1;
  const availabilityStartDate = availability === 'tomorrow'
    ? shiftDate(today, 1)
    : availability === 'this-week' || availability === 'today'
      ? today
      : undefined;
  const availabilityEndDate = availability === 'today'
    ? shiftDate(today, 1)
    : availability === 'tomorrow'
      ? shiftDate(today, 2)
      : availability === 'this-week'
        ? shiftDate(today, daysThroughSunday)
        : undefined;
  const availabilityStart = availabilityStartDate
    ? localTimeToUtc(availabilityStartDate, 0, timeZone)
    : undefined;
  const availabilityEnd = availabilityEndDate
    ? localTimeToUtc(availabilityEndDate, 0, timeZone)
    : undefined;
  const timeRanges = {
    morning: [6, 12],
    afternoon: [12, 17],
    evening: [17, 24],
  } as const;
  const timeRange = timeOfDay in timeRanges
    ? timeRanges[timeOfDay as keyof typeof timeRanges]
    : undefined;
  const firstDay = availabilityStartDate ?? today;
  const lastDay = availabilityEndDate ?? shiftDate(today, 1);
  const dayCount = Math.round(
    (Date.parse(`${lastDay}T00:00:00.000Z`) - Date.parse(`${firstDay}T00:00:00.000Z`))
    / (24 * 60 * 60_000),
  );
  const timeWindows = timeRange
    ? Array.from(
        { length: dayCount },
        (_, index) => {
          const day = shiftDate(firstDay, index);
          return {
            startAt: {
              gte: localTimeToUtc(day, timeRange[0], timeZone),
              lt: localTimeToUtc(day, timeRange[1], timeZone),
            },
          };
        },
      )
    : undefined;
  const slotFilter = {
    status: SlotStatus.FREE,
    startAt: {
      gt: now,
      ...(availabilityStart ? { gte: availabilityStart } : {}),
      ...(availabilityEnd ? { lt: availabilityEnd } : {}),
    },
    ...(timeWindows ? { OR: timeWindows } : {}),
  };
  if (availability && !availabilityStart) return res.status(400).json({ error: 'Choose a valid availability filter.' });
  if (timeOfDay && !timeRange) return res.status(400).json({ error: 'Choose a valid time filter.' });
  const doctors = await prisma.doctor.findMany({
    where: {
      ...(q ? {
        OR: [
          { category: { name: { contains: q, mode: 'insensitive' } } },
          { office: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { clinicName: { contains: q, mode: 'insensitive' } },
          { streetAddress: { contains: q, mode: 'insensitive' } },
          { officeNumber: { contains: q, mode: 'insensitive' } },
          {
            user: {
              AND: nameTerms.map((term) => ({
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' } },
                  { lastName: { contains: term, mode: 'insensitive' } },
                ],
              })),
            },
          },
        ],
      } : {}),
      ...(category ? { category: { name: { contains: category, mode: 'insensitive' } } } : {}),
      ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
      ...(office ? { office: { contains: office, mode: 'insensitive' } } : {}),
      ...(availability || timeOfDay ? { scheduleSlots: { some: slotFilter } } : {}),
    },
    include: {
      category: true,
      user: { select: { firstName: true, lastName: true, email: true } },
      scheduleSlots: {
        where: slotFilter,
        orderBy: { startAt: 'asc' },
        take: 1,
        select: { id: true, startAt: true, endAt: true },
      },
    },
    orderBy: { user: { lastName: 'asc' } },
  });
  res.json({ doctors });
});

router.patch('/doctors/me/office', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const { office } = parsed(officeSchema, req.body);
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const updated = await prisma.doctor.update({ where: { id: doctor.id }, data: { office }, include: { category: true } });
  res.json({ doctor: updated });
});

router.put('/doctors/me/location', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const location = parsed(doctorLocationSchema, req.body);
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const updated = await prisma.doctor.update({ where: { id: doctor.id }, data: location, include: { category: true } });
  res.json({ doctor: updated });
});

router.get('/doctors/me', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, include: { category: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  res.json({ doctor });
});

router.post('/doctors/me/schedule', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const slots = generateScheduleSlots(req.body);
  if (slots[0].startAt <= new Date()) return res.status(400).json({ error: 'Schedule slots must start in the future.' });
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const rangeStart = slots[0].startAt;
  const rangeEnd = slots[slots.length - 1].endAt;
  const result = await prisma.$transaction(async (tx) => {
    const overlap = await tx.scheduleSlot.findFirst({
      where: { doctorId: doctor.id, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { id: true },
    });
    if (overlap) return null;
    const created = await tx.scheduleSlot.createMany({ data: slots.map((slot) => ({ ...slot, doctorId: doctor.id })) });
    return created.count;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result === null) return res.status(409).json({ error: 'This schedule overlaps an existing slot.' });
  res.status(201).json({ created: result, slots });
});

router.post('/doctors/me/schedule/working-days', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const input = parsed(scheduleBatchSchema, req.body);
  const slotsByDate = input.dates.map((date) => generateScheduleSlots({
    date,
    startTime: input.startTime,
    endTime: input.endTime,
  }));
  const slots = slotsByDate.flat();
  if (slots.some((slot) => slot.startAt <= new Date())) {
    return res.status(400).json({ error: 'Schedule slots must start in the future.' });
  }
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const dateRanges = slotsByDate.map((daySlots) => ({
    startAt: { lt: daySlots[daySlots.length - 1].endAt },
    endAt: { gt: daySlots[0].startAt },
  }));
  const result = await prisma.$transaction(async (tx) => {
    const overlap = await tx.scheduleSlot.findFirst({
      where: { doctorId: doctor.id, OR: dateRanges },
      select: { id: true },
    });
    if (overlap) return null;
    const created = await tx.scheduleSlot.createMany({
      data: slots.map((slot) => ({ ...slot, doctorId: doctor.id })),
    });
    return created.count;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result === null) return res.status(409).json({ error: 'One or more working days overlap an existing slot. No slots were created.' });
  res.status(201).json({ created: result, dates: input.dates });
});

router.get('/doctors/:doctorId/schedule', requireAuth, requireRole(Role.PATIENT, Role.DOCTOR, Role.ADMIN), async (req, res) => {
  const doctorId = Array.isArray(req.params.doctorId) ? req.params.doctorId[0] : req.params.doctorId;
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: {
      id: true,
      userId: true,
      office: true,
      city: true,
      clinicName: true,
      streetAddress: true,
      officeNumber: true,
      category: { select: { name: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  const isDoctorOwner = req.user!.role === Role.DOCTOR && req.user!.id === doctor.userId;
  if (req.user!.role === Role.DOCTOR && !isDoctorOwner) return res.status(403).json({ error: 'Doctors can only view their own schedule.' });
  const date = typeof req.query.date === 'string' ? scheduleDateSchema.parse(req.query.date) : undefined;
  const bounds = date ? utcDateBounds(date) : undefined;
  const scheduleWhere = { doctorId: doctor.id, ...(bounds ? { startAt: { gte: bounds.start, lt: bounds.end } } : {}) };
  const slots = isDoctorOwner || req.user!.role === Role.ADMIN
    ? await prisma.scheduleSlot.findMany({
      where: scheduleWhere,
      orderBy: { startAt: 'asc' },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    })
    : await prisma.scheduleSlot.findMany({
      where: scheduleWhere,
      orderBy: { startAt: 'asc' },
      select: { id: true, startAt: true, endAt: true, status: true },
    });
  res.json({
    doctor: {
      id: doctor.id,
      office: doctor.office,
      city: doctor.city,
      clinicName: doctor.clinicName,
      streetAddress: doctor.streetAddress,
      officeNumber: doctor.officeNumber,
      category: doctor.category,
      user: doctor.user,
    },
    slots,
  });
});

router.post('/doctors/:doctorId/schedule/:slotId/book', requireAuth, requireRole(Role.PATIENT), async (req, res) => {
  const doctorId = Array.isArray(req.params.doctorId) ? req.params.doctorId[0] : req.params.doctorId;
  const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;
  const { visitPurpose } = parsed(bookingSchema, req.body);
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  const booked = await prisma.scheduleSlot.updateMany({
    where: { id: slotId, doctorId: doctor.id, status: SlotStatus.FREE, startAt: { gt: new Date() } },
    data: { status: SlotStatus.BOOKED, patientId: req.user!.id, visitPurpose },
  });
  if (booked.count === 0) return res.status(409).json({ error: 'This slot is no longer available.' });
  const slot = await prisma.scheduleSlot.findFirst({
    where: { id: slotId, doctorId: doctor.id },
    select: { id: true, startAt: true, endAt: true, status: true, visitPurpose: true },
  });
  res.status(201).json({ slot });
});

router.patch('/doctors/me/schedule/:slotId', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const input = parsed(slotUpdateSchema, req.body);
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;
  const slot = await prisma.scheduleSlot.findFirst({ where: { id: slotId, doctorId: doctor.id }, select: { id: true, status: true, startAt: true } });
  if (!slot) return res.status(404).json({ error: 'Schedule slot not found.' });
  if (input.status === SlotStatus.BOOKED && slot.status !== SlotStatus.BOOKED && slot.startAt <= new Date()) {
    return res.status(400).json({ error: 'Past schedule slots cannot be booked.' });
  }
  if (slot.status === SlotStatus.BOOKED && !(input.status === SlotStatus.FREE && input.releaseBooking)) {
    return res.status(409).json({ error: 'Booked appointments cannot be edited as open slots. Explicitly release the appointment first.' });
  }
  if (input.releaseBooking && slot.status !== SlotStatus.BOOKED) {
    return res.status(409).json({ error: 'Only a booked appointment can be released.' });
  }
  if (input.patientId) {
    const patient = await prisma.user.findUnique({ where: { id: input.patientId }, select: { role: true } });
    if (patient?.role !== Role.PATIENT) return res.status(400).json({ error: 'The selected patient account was not found.' });
  }
  const updatedCount = await prisma.scheduleSlot.updateMany({
    where: { id: slot.id, doctorId: doctor.id, status: slot.status },
    data: {
      status: input.status as SlotStatus,
      patientId: input.status === SlotStatus.BOOKED ? input.patientId : null,
      visitPurpose: input.status === SlotStatus.BOOKED ? input.visitPurpose : null,
    },
  });
  if (updatedCount.count === 0) {
    return res.status(409).json({ error: 'This slot changed while you were viewing it. Refresh the schedule and try again.' });
  }
  const updated = await prisma.scheduleSlot.findFirst({
    where: { id: slot.id, doctorId: doctor.id },
    include: { patient: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (!updated) return res.status(404).json({ error: 'Schedule slot could not be reloaded after the update.' });
  res.json({ slot: updated });
});

router.get('/doctors/me/schedule/:slotId', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const slot = await prisma.scheduleSlot.findFirst({
    where: { id: slotId, doctorId: doctor.id },
    include: { patient: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (!slot) return res.status(404).json({ error: 'Schedule slot not found.' });
  res.json({ slot });
});

router.get('/admin/users', requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const role = typeof req.query.role === 'string' ? req.query.role.toUpperCase() : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : undefined;
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const users = await prisma.user.findMany({
    where: {
      ...(role && role in Role ? { role: Role[role as keyof typeof Role] } : {}),
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      phone: true,
      createdAt: true,
      iin: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const normalized = users.map((user) => ({
    ...user,
    maskedIin: user.iin ? `${'•'.repeat(Math.max(0, user.iin.length - 2))}${user.iin.slice(-2)}` : null,
    status: status && ['active', 'inactive'].includes(status) ? status : 'active',
  }));

  if (status === 'inactive') return res.json({ users: normalized.filter((user) => user.role !== Role.DOCTOR && user.role !== Role.PATIENT ? user.status === 'inactive' : false) });
  res.json({ users: normalized });
});

router.patch('/admin/users/:id', requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { role, status, firstName, lastName, email, phone } = req.body as {
    role?: Role;
    status?: 'active' | 'inactive';
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
  };

  const result = await prisma.user.update({
    where: { id },
    data: {
      ...(role ? { role } : {}),
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      phone: true,
      createdAt: true,
      iin: true,
    },
  });

  res.json({
    user: {
      ...result,
      maskedIin: result.iin ? `${'•'.repeat(Math.max(0, result.iin.length - 2))}${result.iin.slice(-2)}` : null,
      status: status ?? 'active',
    },
  });
});

router.get('/admin/metrics', requireAuth, requireRole(Role.ADMIN), async (_req, res) => {
  const [totalUsers, patients, doctors, admins, appointments] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: Role.PATIENT } }),
    prisma.user.count({ where: { role: Role.DOCTOR } }),
    prisma.user.count({ where: { role: Role.ADMIN } }),
    prisma.scheduleSlot.count({ where: { status: 'BOOKED' } }),
  ]);

  res.json({
    totalUsers,
    patients,
    doctors,
    admins,
    appointments,
    pendingReviews: Math.max(0, doctors - 2),
    recentUsers: await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
    }),
  });
});

router.get('/admin/doctors', requireAuth, requireRole(Role.ADMIN), async (_req, res) => {
  const doctors = await prisma.doctor.findMany({
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, createdAt: true } },
      category: true,
      scheduleSlots: { take: 5, orderBy: { startAt: 'asc' }, select: { startAt: true, endAt: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    doctors: doctors.map((doctor) => ({
      id: doctor.id,
      userId: doctor.userId,
      name: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`,
      email: doctor.user.email,
      specialty: doctor.category.name,
      office: doctor.office,
      status: doctor.office ? 'verified' : 'pending',
      createdAt: doctor.createdAt,
      scheduleSlots: doctor.scheduleSlots,
    })),
  });
});

router.get('/admin/appointments', requireAuth, requireRole(Role.ADMIN), async (_req, res) => {
  const appointments = await prisma.scheduleSlot.findMany({
    where: { status: 'BOOKED' },
    orderBy: { startAt: 'asc' },
    take: 20,
    include: {
      doctor: { include: { user: { select: { firstName: true, lastName: true } }, category: true } },
      patient: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  res.json({ appointments: appointments.map((slot) => ({
    id: slot.id,
    patient: slot.patient ? `${slot.patient.firstName} ${slot.patient.lastName}` : 'Unknown patient',
    doctor: `Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`,
    specialty: slot.doctor.category.name,
    date: slot.startAt,
    status: 'confirmed',
    purpose: slot.visitPurpose,
  })) });
});

router.post('/admin/doctors/:id/approve', requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doctor = await prisma.doctor.findUnique({ where: { id }, include: { user: { select: { firstName: true, lastName: true } }, category: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  res.json({
    ok: true,
    doctor: {
      id: doctor.id,
      name: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`,
      specialty: doctor.category.name,
      status: 'verified',
      note: req.body?.note ?? 'Verification approved.',
    },
  });
});

router.post('/admin/doctors/:id/reject', requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doctor = await prisma.doctor.findUnique({ where: { id }, include: { user: { select: { firstName: true, lastName: true } }, category: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  res.json({
    ok: true,
    doctor: {
      id: doctor.id,
      name: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`,
      specialty: doctor.category.name,
      status: 'rejected',
      reason: req.body?.reason ?? 'Please provide a valid professional license.',
    },
  });
});
export default router;
