import { Router, Request, Response } from 'express';
import { Prisma, Role, SlotStatus } from '@prisma/client';
import { prisma } from './prisma';
import { comparePassword, hashPassword, hashToken, randomToken, randomVerificationCode, signToken } from './auth';
import { config } from './config';
import { requireAuth, requireRole } from './middleware';
import { bookingSchema, officeSchema, registrationSchema, loginSchema, recoverySchema, resetSchema, scheduleDateSchema, slotUpdateSchema, verificationCodeSchema } from './validation';
import { Resend } from 'resend';
import { generateScheduleSlots, utcDateBounds } from './schedule';
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
  const notification = await sendRegistrationConfirmation(user.email, user.firstName, config.RESEND_API_KEY);
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

router.get('/me', requireAuth, async (req, res) => res.json({ user: await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true } }) }));
router.get('/categories', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  res.json({ categories: await prisma.category.findMany({ where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined, orderBy: { name: 'asc' } }) });
});
router.get('/doctors', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const office = typeof req.query.office === 'string' ? req.query.office.trim() : '';
  const normalizedNameQuery = q.replace(/^(?:dr\.?|doctor)\s+/i, '').trim();
  const nameTerms = (normalizedNameQuery || q).split(/\s+/).filter(Boolean);
  const availability = typeof req.query.availability === 'string' ? req.query.availability : '';
  const timeOfDay = typeof req.query.timeOfDay === 'string' ? req.query.timeOfDay : '';
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysThroughSunday = (7 - today.getUTCDay()) % 7 + 1;
  const availabilityStart = availability === 'tomorrow'
    ? new Date(today.getTime() + 24 * 60 * 60_000)
    : availability === 'this-week' || availability === 'today'
      ? today
      : undefined;
  const availabilityEnd = availability === 'today'
    ? new Date(today.getTime() + 24 * 60 * 60_000)
    : availability === 'tomorrow'
      ? new Date(today.getTime() + 2 * 24 * 60 * 60_000)
      : availability === 'this-week'
        ? new Date(today.getTime() + daysThroughSunday * 24 * 60 * 60_000)
        : undefined;
  const timeRanges = {
    morning: [6, 12],
    afternoon: [12, 17],
    evening: [17, 24],
  } as const;
  const timeRange = timeOfDay in timeRanges
    ? timeRanges[timeOfDay as keyof typeof timeRanges]
    : undefined;
  const firstDay = availabilityStart ?? today;
  const lastDay = availabilityEnd ?? new Date(today.getTime() + 24 * 60 * 60_000);
  const timeWindows = timeRange
    ? Array.from(
        { length: Math.ceil((lastDay.getTime() - firstDay.getTime()) / (24 * 60 * 60_000)) },
        (_, index) => {
          const day = new Date(firstDay.getTime() + index * 24 * 60 * 60_000);
          return {
            startAt: {
              gte: new Date(day.getTime() + timeRange[0] * 60 * 60_000),
              lt: new Date(day.getTime() + timeRange[1] * 60 * 60_000),
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

router.get('/doctors/:doctorId/schedule', requireAuth, requireRole(Role.PATIENT, Role.DOCTOR, Role.ADMIN), async (req, res) => {
  const doctorId = Array.isArray(req.params.doctorId) ? req.params.doctorId[0] : req.params.doctorId;
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true, userId: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  const isDoctorOwner = req.user!.role === Role.DOCTOR && req.user!.id === doctor.userId;
  if (req.user!.role === Role.DOCTOR && !isDoctorOwner) return res.status(403).json({ error: 'Doctors can only view their own schedule.' });
  const date = typeof req.query.date === 'string' ? scheduleDateSchema.parse(req.query.date) : undefined;
  const bounds = date ? utcDateBounds(date) : undefined;
  const slots = await prisma.scheduleSlot.findMany({
    where: { doctorId: doctor.id, ...(bounds ? { startAt: { gte: bounds.start, lt: bounds.end } } : {}) },
    orderBy: { startAt: 'asc' },
    ...(isDoctorOwner || req.user!.role === Role.ADMIN ? { include: { patient: { select: { id: true, firstName: true, lastName: true } } } } : {}),
  });
  res.json({ slots });
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
  const slot = await prisma.scheduleSlot.findFirst({ where: { id: slotId, doctorId: doctor.id }, select: { id: true } });
  if (!slot) return res.status(404).json({ error: 'Schedule slot not found.' });
  if (input.patientId) {
    const patient = await prisma.user.findUnique({ where: { id: input.patientId }, select: { role: true } });
    if (patient?.role !== Role.PATIENT) return res.status(400).json({ error: 'The selected patient account was not found.' });
  }
  const updated = await prisma.scheduleSlot.update({
    where: { id: slot.id },
    data: { status: input.status as SlotStatus, patientId: input.patientId ?? null, visitPurpose: input.visitPurpose ?? null },
    include: { patient: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
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

router.get('/admin/users', requireAuth, requireRole(Role.ADMIN), async (_req, res) => res.json({ users: await prisma.user.findMany({ select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true }, orderBy: { createdAt: 'desc' } }) }));
export default router;
