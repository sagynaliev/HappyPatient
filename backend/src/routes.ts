import { getWalkInSlotStatus, NO_CHECKIN_GRACE_MS } from './visitTime';
import { medicalHistoryRouter } from './medicalHistory';
import { resolvePricingRule, calculateParkingCost, calculateVisitCost, PricingRule } from './pricing';
import { getAdminStatistics, runAndStoreIntegrity } from './adminOperations';
import { clockOffsetMs, realNow, setClockOffset, timeControlEnabled } from './clock';
import { releaseUnattendedSlots, sendUpcomingReminders } from './appointmentLifecycle';
import { brandedEmail } from './email/layout';
import { appointmentEmail } from './email/appointment';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma, Role, SlotStatus } from '@prisma/client';
import { prisma } from './prisma';
import { comparePassword, hashPassword, hashToken, isLegacyHash, randomToken, randomVerificationCode, signToken } from './auth';
import { rateLimit } from './rateLimit';
import { config } from './config';
import { requireAuth, requireRole } from './middleware';
import { bookingSchema, cancelSchema, doctorLocationSchema, officeSchema, registrationSchema, loginSchema, profileUpdateSchema, recoverySchema, resetSchema, scheduleBatchSchema, scheduleDateSchema, slotUpdateSchema, verificationCodeSchema, walkInLookupSchema, walkInRegistrationSchema, isValidIin } from './validation';
import { Resend } from 'resend';
import { clinicDateBounds, generateScheduleSlots, localDateAt, localTimeToUtc } from './schedule';
import { sendRegistrationConfirmation } from './registrationNotification';
import { formatAlmaty, notifyUser, recordAppointmentNotification } from './appointmentNotifications';

class WalkInConflict extends Error {}
const router = Router();
router.use(medicalHistoryRouter);
const parsed = <T>(schema: { parse: (v: unknown) => T }, body: unknown) => schema.parse(body);
const publicUser = (u: { id: string; email: string; firstName: string; lastName: string; role: Role; phone: string | null }) =>
  ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role, phone: u.phone });
const appointmentReference = (slotId: string) => `HP-${slotId.slice(-8).toUpperCase()}`;
const emailKey = (req: Request) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '');
// Per address + account for guessing; a wider per-address cap for scripted floods of the hashing endpoints.
const signInLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, key: emailKey, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
const authFloodLimit = rateLimit({ windowMs: 15 * 60_000, max: 100 });
const recoveryLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, key: emailKey });

router.post('/auth/register', authFloodLimit, async (req, res) => {
  const input = parsed(registrationSchema, req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return res.status(409).json({ error: 'Email is already registered' });
  const { password, ...profile } = input;
  const user = await prisma.user.create({ data: { ...profile, passwordHash: await hashPassword(password) } });
  const notification = await sendRegistrationConfirmation(user.email, user.firstName, config.RESEND_API_KEY, config.FRONTEND_URL);
  void notifyUser({ userId: user.id, type: 'WELCOME', subject: 'Welcome to HappyPatient', message: `Hi ${user.firstName}, your account has been created. You can now search for doctors and book appointments online.` });
  res.status(201).json({ user: publicUser(user), token: signToken({ id: user.id, email: user.email, role: user.role }), notification });
});

router.post('/auth/login', authFloodLimit, signInLimit, async (req, res) => {
  const input = parsed(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await comparePassword(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
  // Old bcrypt hash and the password is known to be right: store it in the current format. A failure here must not block sign-in.
  if (isLegacyHash(user.passwordHash)) void hashPassword(input.password).then((passwordHash) => prisma.user.update({ where: { id: user.id }, data: { passwordHash } })).catch(() => undefined);
  res.json({ user: publicUser(user), token: signToken({ id: user.id, email: user.email, role: user.role }) });
});

router.post('/auth/forgot-password', authFloodLimit, recoveryLimit, async (req, res) => {
  const { email } = parsed(recoverySchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const response = { message: 'If that email exists, a verification code has been sent' };
  if (user) {
    const cooldownSince = new Date(Date.now() - 60_000);
    const recentCode = await prisma.resetToken.findFirst({ where: { userId: user.id, createdAt: { gt: cooldownSince }, usedAt: null }, select: { id: true } });
    if (!recentCode) {
      if (!config.RESEND_API_KEY) return res.status(503).json({ error: 'Password recovery email is not configured.' });
      const code = randomVerificationCode();
      const resend = new Resend(config.RESEND_API_KEY);
      try {
        const { error } = await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: user.email,
          subject: 'Your HappyPatient password reset code',
          ...brandedEmail({ title: 'Your password reset code', message: 'Use this code to reset your HappyPatient password.', code, tone: 'info', status: 'Security code', nextStep: 'This code expires in 10 minutes and can only be used once. If you did not ask to reset your password, you can ignore this email.' }),
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

router.post('/auth/verify-reset-code', authFloodLimit, recoveryLimit, async (req, res) => {
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

router.post('/auth/reset-password', authFloodLimit, async (req, res) => {
  const { token, password } = parsed(resetSchema, req.body);
  const record = await prisma.resetToken.findFirst({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
  if (!record) return res.status(400).json({ error: 'Invalid or expired reset token' });
  await prisma.$transaction([prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password) } }), prisma.resetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })]);
  void notifyUser({ userId: record.userId, type: 'PASSWORD_CHANGED', subject: 'Your password was changed', message: `Your HappyPatient password was changed on ${formatAlmaty(new Date())}. If this was not you, contact the clinic administrator.` });
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
  const changed = Object.keys(input).map((key) => ({ firstName: 'first name', lastName: 'last name', phone: 'phone number' }[key] ?? key));
  if (changed.length) void notifyUser({ userId: user.id, type: 'PROFILE_UPDATED', subject: 'Profile updated', message: `Your ${changed.join(', ')} ${changed.length > 1 ? 'were' : 'was'} updated.` });
  res.json({ user: maskedProfile(user) });
});
router.get('/me/appointments', requireAuth, requireRole(Role.PATIENT), async (req, res) => {
  const [appointments, cancelledRows, missed] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: { patientId: req.user!.id },
      orderBy: { startAt: 'asc' },
      select: {
        id: true, startAt: true, endAt: true, status: true, visitPurpose: true, checkedInAt: true, updatedAt: true, doctorId: true,
        doctor: { select: { id: true, office: true, consultationFee: true, categoryId: true, locationId: true, category: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.cancelledAppointment.findMany({
      where: { patientId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, slotId: true, startAt: true, endAt: true, visitPurpose: true, reason: true, cancelledByRole: true, createdAt: true,
        doctor: { select: { office: true, consultationFee: true, category: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    missedVisits({ patientId: req.user!.id }),
  ]);
  // Same price as the breakdown (rules at booking time); falls back to the doctor's fee if pricing is unavailable.
  // Booking times and rules are loaded once for the whole list instead of once per appointment.
  const prices = await listPrices(appointments, req.user!.id).catch(() => new Map<string, number>());
  res.json({
    // Visits released because nobody checked in. Not cancellations: shown as "Missed" among past visits.
    missed: missed.map((row) => ({ id: row.id, slotId: row.slotId, startAt: row.startAt, endAt: row.endAt, releasedAt: row.createdAt, reference: appointmentReference(row.slotId), doctor: row.doctor })),
    cancelled: (cancelledRows ?? []).map(({ doctor, ...row }) => ({
      ...row,
      reference: row.slotId ? appointmentReference(row.slotId) : undefined,
      cancelledBy: row.cancelledByRole === Role.PATIENT ? 'PATIENT' : 'CLINIC',
      doctor: { name: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`, specialty: doctor.category.name, office: doctor.office, consultationFee: doctor.consultationFee },
    })),
    appointments: appointments.map(({ doctor, updatedAt: _updatedAt, doctorId: _doctorId, ...appointment }) => ({
      ...appointment,
      priceKzt: prices.get(appointment.id) ?? doctor.consultationFee,
      reference: appointmentReference(appointment.id),
      doctor: {
        id: doctor.id,
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
  try {
    const categories = await prisma.category.findMany({
      where: { active: true, ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}) },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (error: unknown) {
    console.error('Failed to load categories from PostgreSQL', {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined,
    });
    res.status(500).json({ error: 'The category directory is temporarily unavailable. Please try again shortly.' });
  }
});
async function inactiveOfficeIds() {
  const locations=await prisma.location.findMany({select:{id:true,kind:true,parentId:true,active:true}});
  const byId=new Map(locations.map(item=>[item.id,item]));
  return locations.filter(item=>{
    if(item.kind!=='office')return false;
    const floor=item.parentId?byId.get(item.parentId):undefined;
    const city=floor?.parentId?byId.get(floor.parentId):undefined;
    return !item.active||!floor?.active||!city?.active;
  }).map(item=>item.id);
}
router.get('/doctors/locations', async (_req, res) => {
  const inactive=await inactiveOfficeIds();
  const [doctors,referenceCities]=await Promise.all([
    prisma.doctor.findMany({where:{city:{not:null},category:{active:true},OR:[{locationId:null},{locationId:{notIn:inactive}}]},select:{city:true},distinct:['city'],orderBy:{city:'asc'}}),
    prisma.location.findMany({where:{kind:'city',active:true},select:{name:true},orderBy:{name:'asc'}}),
  ]);
  const cities=new Map<string,string>();
  [...doctors.map(row=>row.city),...referenceCities.map(row=>row.name)].forEach(value=>{const name=value?.trim();if(name&&!cities.has(name.toLocaleLowerCase()))cities.set(name.toLocaleLowerCase(),name);});
  res.json({cities:Array.from(cities.values()).sort((a,b)=>a.localeCompare(b))});
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
  let cityOfficeIds: string[] = [];
  if (city) {
    const cities = await prisma.location.findMany({ where: { kind: 'city', active: true, name: { equals: city, mode: 'insensitive' } }, select: { id: true } });
    const floors = await prisma.location.findMany({ where: { kind: 'floor', active: true, parentId: { in: cities.map(item => item.id) } }, select: { id: true } });
    const offices = await prisma.location.findMany({ where: { kind: 'office', active: true, parentId: { in: floors.map(item => item.id) } }, select: { id: true } });
    cityOfficeIds = offices.map(item => item.id);
  }
  const inactiveOffices=await inactiveOfficeIds();
  const locationConditions: Prisma.DoctorWhereInput[] = [];
  if (city) locationConditions.push({ OR: [{ city: { equals: city, mode: 'insensitive' } }, { locationId: { in: cityOfficeIds } }] });
  if (office) locationConditions.push({ OR: [{ office: { contains: office, mode: 'insensitive' } }, { location: { is: { kind: 'office', name: { contains: office, mode: 'insensitive' } } } }] });
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
      AND:[...locationConditions,{category:{active:true}},...(inactiveOffices.length?[{OR:[{locationId:null},{locationId:{notIn:inactiveOffices}}]}]:[])],
      ...(availability || timeOfDay ? { scheduleSlots: { some: slotFilter } } : {}),
    },
    include: {
      category: true,
      // Names only: this list is public, so doctors' email addresses stay out of it.
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { user: { lastName: 'asc' } },
  });
  // Next free time per doctor in one indexed query. Asking for it as a nested "first slot" made the
  // database client load every free slot of every doctor on each search.
  const doctorIds = doctors.map((doctor) => doctor.id);
  const nextSlots = doctorIds.length ? (await prisma.$queryRaw<Array<{ id: string; doctorId: string; startAt: Date; endAt: Date }>>(Prisma.sql`
    SELECT DISTINCT ON (s."doctorId") s."id", s."doctorId", s."startAt", s."endAt"
    FROM "ScheduleSlot" s
    WHERE s."status" = 'FREE'::"SlotStatus" AND s."startAt" > ${now}
      ${availabilityStart ? Prisma.sql`AND s."startAt" >= ${availabilityStart}` : Prisma.empty}
      ${availabilityEnd ? Prisma.sql`AND s."startAt" < ${availabilityEnd}` : Prisma.empty}
      ${timeWindows?.length ? Prisma.sql`AND (${Prisma.join(timeWindows.map((window) => Prisma.sql`(s."startAt" >= ${window.startAt.gte} AND s."startAt" < ${window.startAt.lt})`), ' OR ')})` : Prisma.empty}
      AND s."doctorId" IN (${Prisma.join(doctorIds)})
    ORDER BY s."doctorId", s."startAt"`)) ?? [] : [];
  const nextByDoctor = new Map(nextSlots.map((slot) => [slot.doctorId, { id: slot.id, startAt: slot.startAt, endAt: slot.endAt }]));
  // Show the price a booking made now would be charged: the active visit rule, else the doctor's own fee.
  const fees = await currentVisitFees(doctors, now);
  res.json({ doctors: doctors.map((doctor) => ({ ...doctor, consultationFee: fees.get(doctor.id) ?? doctor.consultationFee, scheduleSlots: nextByDoctor.has(doctor.id) ? [nextByDoctor.get(doctor.id)!] : [] })) });
});

router.patch('/doctors/me/office', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const { office } = parsed(officeSchema, req.body);
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const updated = await prisma.doctor.update({ where: { id: doctor.id }, data: { office }, include: { category: true } });
  res.json({ doctor: updated });
});

router.put('/doctors/me/location', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const { locationId, ...location } = parsed(doctorLocationSchema, req.body);
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true, locationId: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  if (locationId === undefined) {
    const updated = await prisma.doctor.update({ where: { id: doctor.id }, data: location, include: { category: true } });
    return res.json({ doctor: updated });
  }
  const office = locationId ? await activeOffice(locationId) : null;
  if (locationId && !office) return res.status(400).json({ error: 'Choose an active office from the clinic list.' });
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.doctor.update({
      where: { id: doctor.id },
      data: { ...location, locationId: office?.id ?? null, ...(office ? { office: office.name, officeNumber: office.name, city: office.city } : {}) },
      include: { category: true },
    });
    if ((office?.id ?? null) !== doctor.locationId) await tx.referenceDataAudit.create({ data: { actorId: req.user!.id, entity: 'doctor-office', entityId: doctor.id, action: 'chosen-by-doctor', oldValue: { locationId: doctor.locationId }, newValue: { locationId: office?.id ?? null } } });
    return saved;
  });
  res.json({ doctor: updated });
});

/** An office that patients can be sent to: it, its floor and its city are all active. */
async function activeOffice(locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId }, include: { parent: { include: { parent: true } } } });
  if (!location || location.kind !== 'office' || !location.active || !location.parent?.active || !location.parent.parent?.active) return null;
  return { id: location.id, name: location.name, floor: location.parent.name, city: location.parent.parent.name };
}

/** The clinic's active offices, for the doctor's own office picker. */
router.get('/doctors/me/offices', requireAuth, requireRole(Role.DOCTOR), async (_req, res) => {
  const offices = (await prisma.location.findMany({
    where: { kind: 'office', active: true, parent: { active: true, parent: { active: true } } },
    select: { id: true, name: true, parent: { select: { name: true, parent: { select: { name: true } } } } },
    orderBy: { name: 'asc' },
  })) ?? [];
  const list = offices.map((office) => ({ id: office.id, name: office.name, floor: office.parent?.name ?? '', city: office.parent?.parent?.name ?? '' }));
  list.sort((a, b) => a.city.localeCompare(b.city) || a.floor.localeCompare(b.floor, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  res.json({ offices: list });
});

/** Visits released for no check-in, newest first, with the doctor's and patient's display names. */
async function missedVisits(where: { patientId?: string; doctorId?: string }) {
  const rows = (await prisma.expiredAppointment.findMany({ where, orderBy: { startAt: 'desc' }, select: { id: true, slotId: true, doctorId: true, patientId: true, startAt: true, endAt: true, createdAt: true } })) ?? [];
  if (!rows.length) return [];
  const patientIds = Array.from(new Set(rows.flatMap((row) => row.patientId ? [row.patientId] : [])));
  const [doctors, patients] = await Promise.all([
    prisma.doctor.findMany({ where: { id: { in: Array.from(new Set(rows.map((row) => row.doctorId))) } }, select: { id: true, office: true, category: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } }),
    patientIds.length ? prisma.user.findMany({ where: { id: { in: patientIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
  ]);
  const doctorById = new Map((doctors ?? []).map((doctor) => [doctor.id, { name: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`, specialty: doctor.category.name, office: doctor.office }]));
  const patientById = new Map((patients ?? []).map((patient) => [patient.id, `${patient.firstName} ${patient.lastName}`]));
  return rows.map((row) => ({ ...row, doctor: doctorById.get(row.doctorId) ?? { name: 'Doctor', specialty: '', office: null }, patientName: row.patientId ? patientById.get(row.patientId) ?? 'Patient' : 'Patient' }));
}

router.get('/doctors/me/missed-visits', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const rows = await missedVisits({ doctorId: doctor.id });
  res.json({ missed: rows.map((row) => ({ id: row.id, slotId: row.slotId, startAt: row.startAt, endAt: row.endAt, releasedAt: row.createdAt, patientName: row.patientName })) });
});

router.get('/doctors/me', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, include: { category: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  // The fee patients are charged now, so the doctor sees the same price as the booking screens.
  const fee = doctor.categoryId ? (await currentVisitFees([doctor], new Date())).get(doctor.id) : undefined;
  res.json({ doctor: { ...doctor, consultationFee: fee ?? doctor.consultationFee } });
});

/**
 * Creates the requested 30-minute slots, skipping times that have already started or overlap an existing slot.
 * Returns what was created and what was skipped (with the reason) so the doctor sees exactly which times were left out.
 */
async function createAvailability(doctorId: string, requested: Array<{ startAt: Date; endAt: Date }>) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.scheduleSlot.findMany({
      where: { doctorId, startAt: { lt: requested[requested.length - 1].endAt }, endAt: { gt: requested[0].startAt } },
      select: { startAt: true, endAt: true },
    });
    const skipped: Array<{ startAt: Date; reason: 'past' | 'taken' }> = [];
    const toCreate = requested.filter((slot) => {
      if (slot.startAt <= now) { skipped.push({ startAt: slot.startAt, reason: 'past' }); return false; }
      if (existing.some((item) => item.startAt < slot.endAt && item.endAt > slot.startAt)) { skipped.push({ startAt: slot.startAt, reason: 'taken' }); return false; }
      return true;
    });
    const created = toCreate.length ? (await tx.scheduleSlot.createMany({ data: toCreate.map((slot) => ({ ...slot, doctorId })) })).count : 0;
    return { created, toCreate, skipped };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
const skippedSummary = (skipped: Array<{ startAt: Date; reason: 'past' | 'taken' }>) => {
  const past = skipped.filter((item) => item.reason === 'past').length;
  const taken = skipped.filter((item) => item.reason === 'taken').length;
  return [past && `${past} already started`, taken && `${taken} already in your schedule`].filter(Boolean).join(', ');
};

router.post('/doctors/me/schedule', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const slots = generateScheduleSlots(req.body);
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const result = await createAvailability(doctor.id, slots);
  if (!result.created) return res.status(409).json({ error: `No new slots: every time in this range has ${result.skipped.every((item) => item.reason === 'past') ? 'already started' : 'already started or is already in your schedule'}.`, skipped: result.skipped });
  void notifyUser({ userId: req.user!.id, type: 'SCHEDULE_CREATED', subject: 'Schedule updated', message: `${result.created} new 30-minute slot${result.created === 1 ? '' : 's'} opened from ${formatAlmaty(result.toCreate[0].startAt)} to ${formatAlmaty(result.toCreate[result.toCreate.length - 1].endAt)}. Patients can book them now.` });
  res.status(201).json({ created: result.created, slots: result.toCreate, skipped: result.skipped, skippedSummary: skippedSummary(result.skipped) });
});

router.post('/doctors/me/schedule/working-days', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const input = parsed(scheduleBatchSchema, req.body);
  const slots = input.dates.flatMap((date) => generateScheduleSlots({ date, startTime: input.startTime, endTime: input.endTime }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const result = await createAvailability(doctor.id, slots);
  if (!result.created) return res.status(409).json({ error: `No new slots were created: ${skippedSummary(result.skipped)}.`, skipped: result.skipped });
  const days = new Set(result.toCreate.map((slot) => localDateAt(slot.startAt, 'Asia/Almaty'))).size;
  void notifyUser({ userId: req.user!.id, type: 'SCHEDULE_CREATED', subject: 'Schedule updated', message: `${result.created} new 30-minute slot${result.created === 1 ? '' : 's'} opened across ${days} working day${days === 1 ? '' : 's'} (${input.startTime}–${input.endTime}). Patients can book them now.` });
  res.status(201).json({ created: result.created, dates: input.dates, skipped: result.skipped, skippedSummary: skippedSummary(result.skipped) });
});

router.get('/doctors/:doctorId/schedule', requireAuth, requireRole(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.FRONT_DESK), async (req, res) => {
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
  const bounds = date ? clinicDateBounds(date) : undefined;
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
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true, userId: true, office: true, user: { select: { firstName: true, lastName: true } } } });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  const booked = await prisma.scheduleSlot.updateMany({
    where: { id: slotId, doctorId: doctor.id, status: SlotStatus.FREE, startAt: { gt: new Date() } },
    data: { status: SlotStatus.BOOKED, patientId: req.user!.id, visitPurpose },
  });
  if (booked.count === 0) return res.status(409).json({ error: 'This slot is no longer available.' });
  const slot = await prisma.scheduleSlot.findFirst({
    where: { id: slotId, doctorId: doctor.id },
    select: { id: true, startAt: true, endAt: true, status: true, visitPurpose: true, updatedAt: true },
  });
  if (slot) {
    void recordAppointmentNotification({
      slotId: slot.id,
      userId: req.user!.id,
      email: req.user!.email,
      event: 'BOOKED',
      occurrenceId: slot.updatedAt?.toISOString(),
      reference: appointmentReference(slot.id),
      doctor: doctor.user ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : 'your doctor',
      startAt: slot.startAt,
      endAt: slot.endAt,
      office: doctor.office,
      doctorUserId: doctor.userId,
    }).catch((error: unknown) => console.error('Booking notification could not be recorded', { name: error instanceof Error ? error.name : undefined }));
  }
  res.status(201).json({ slot, reference: slot ? appointmentReference(slot.id) : undefined });
});

router.post('/appointments/:slotId/cancel', requireAuth, requireRole(Role.PATIENT), async (req, res) => {
  const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;
  const { reason } = parsed(cancelSchema, req.body ?? {});
  const slot = await prisma.scheduleSlot.findFirst({ where: { id: slotId, patientId: req.user!.id }, select: { id: true, status: true, startAt: true, endAt: true, patientId: true, doctorId: true, visitPurpose: true, updatedAt: true, doctor: { select: { userId: true, office: true, user: { select: { firstName: true, lastName: true } } } } } });
  if (!slot || slot.patientId !== req.user!.id) return res.status(404).json({ error: 'Appointment not found.' });
  if (slot.status !== SlotStatus.BOOKED) return res.status(409).json({ error: 'Only booked appointments can be cancelled.' });
  if (slot.startAt <= new Date()) return res.status(409).json({ error: 'Past or started appointments cannot be cancelled.' });
  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.scheduleSlot.updateMany({ where: { id: slot.id, patientId: req.user!.id, status: SlotStatus.BOOKED }, data: { status: SlotStatus.FREE, patientId: null, visitPurpose: null } });
    if (!updated.count) return false;
    await tx.cancelledAppointment.create({ data: { slotId: slot.id, patientId: req.user!.id, doctorId: slot.doctorId, startAt: slot.startAt, endAt: slot.endAt, visitPurpose: slot.visitPurpose, reason, cancelledById: req.user!.id, cancelledByRole: Role.PATIENT } });
    return true;
  });
  if (!cancelled) return res.status(409).json({ error: 'This appointment changed while it was being cancelled. Refresh and try again.' });
  void recordAppointmentNotification({ slotId: slot.id, userId: req.user!.id, email: req.user!.email, event: 'CANCELLED', occurrenceId: slot.updatedAt?.toISOString(), reference: appointmentReference(slot.id), doctor: `Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`, startAt: slot.startAt, endAt: slot.endAt, office: slot.doctor.office, doctorUserId: slot.doctor.userId, reason }).catch(() => undefined);
  res.json({ cancelled: true, reference: appointmentReference(slot.id) });
});

class SlotUnavailableError extends Error {}
class AppointmentChangedError extends Error {}
const rescheduleSchema = z.object({ newSlotId: z.string().trim().min(1).max(100) });

/** Moves a booked visit to another free slot of the same doctor in one transaction: the new time is taken and the old one released together. */
router.post('/appointments/:slotId/reschedule', requireAuth, requireRole(Role.PATIENT), async (req, res) => {
  const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;
  const { newSlotId } = parsed(rescheduleSchema, req.body ?? {});
  if (newSlotId === slotId) return res.status(400).json({ error: 'Choose a different time.' });
  const old = await prisma.scheduleSlot.findFirst({ where: { id: slotId, patientId: req.user!.id }, select: { id: true, status: true, startAt: true, endAt: true, doctorId: true, visitPurpose: true, updatedAt: true, doctor: { select: { userId: true, office: true, user: { select: { firstName: true, lastName: true } } } } } });
  if (!old) return res.status(404).json({ error: 'Appointment not found.' });
  if (old.status !== SlotStatus.BOOKED) return res.status(409).json({ error: 'Only booked appointments can be changed.' });
  if (old.startAt <= new Date()) return res.status(409).json({ error: 'Past or started appointments cannot be changed.' });
  const target = await prisma.scheduleSlot.findFirst({ where: { id: newSlotId, doctorId: old.doctorId }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'That time was not found for this doctor.' });
  const reason = 'Rescheduled to another time';
  try {
    await prisma.$transaction(async (tx) => {
      const booked = await tx.scheduleSlot.updateMany({ where: { id: newSlotId, doctorId: old.doctorId, status: SlotStatus.FREE, startAt: { gt: new Date() } }, data: { status: SlotStatus.BOOKED, patientId: req.user!.id, visitPurpose: old.visitPurpose } });
      if (!booked.count) throw new SlotUnavailableError();
      const freed = await tx.scheduleSlot.updateMany({ where: { id: old.id, patientId: req.user!.id, status: SlotStatus.BOOKED }, data: { status: SlotStatus.FREE, patientId: null, visitPurpose: null } });
      if (!freed.count) throw new AppointmentChangedError();
      await tx.cancelledAppointment.create({ data: { slotId: old.id, patientId: req.user!.id, doctorId: old.doctorId, startAt: old.startAt, endAt: old.endAt, visitPurpose: old.visitPurpose, reason, cancelledById: req.user!.id, cancelledByRole: Role.PATIENT } });
    });
  } catch (error) {
    if (error instanceof SlotUnavailableError) return res.status(409).json({ error: 'This slot is no longer available.' });
    if (error instanceof AppointmentChangedError) return res.status(409).json({ error: 'This appointment changed while it was being updated. Refresh and try again.' });
    throw error;
  }
  const slot = await prisma.scheduleSlot.findFirst({ where: { id: newSlotId, doctorId: old.doctorId }, select: { id: true, startAt: true, endAt: true, status: true, visitPurpose: true, updatedAt: true } });
  const doctorName = `Dr. ${old.doctor.user.firstName} ${old.doctor.user.lastName}`;
  void recordAppointmentNotification({ slotId: old.id, userId: req.user!.id, email: req.user!.email, event: 'CANCELLED', occurrenceId: old.updatedAt?.toISOString(), reference: appointmentReference(old.id), doctor: doctorName, startAt: old.startAt, endAt: old.endAt, office: old.doctor.office, doctorUserId: old.doctor.userId, reason }).catch(() => undefined);
  if (slot) void recordAppointmentNotification({ slotId: slot.id, userId: req.user!.id, email: req.user!.email, event: 'BOOKED', occurrenceId: slot.updatedAt?.toISOString(), reference: appointmentReference(slot.id), doctor: doctorName, startAt: slot.startAt, endAt: slot.endAt, office: old.doctor.office, doctorUserId: old.doctor.userId }).catch(() => undefined);
  res.status(201).json({ slot, reference: slot ? appointmentReference(slot.id) : undefined, previousReference: appointmentReference(old.id) });
});

router.post('/appointments/:slotId/check-in', requireAuth, requireRole(Role.PATIENT, Role.FRONT_DESK, Role.ADMIN), async (req, res) => {
  const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;
  const existing = await prisma.scheduleSlot.findFirst({ where: { id: slotId }, include: { patient: true, doctor: { include: { user: true } } } });
  if (!existing || !existing.patient) return res.status(404).json({ error: 'Booked appointment not found.' });
  if (req.user!.role === Role.PATIENT && existing.patientId !== req.user!.id) return res.status(403).json({ error: 'You can only check in your own appointment.' });
  if (existing.status === SlotStatus.OCCUPIED) return res.status(409).json({ error: 'This appointment has already been checked in.' });
  if (existing.status !== SlotStatus.BOOKED) return res.status(409).json({ error: 'Only booked appointments can be checked in.' });
  if (existing.startAt.getTime() - Date.now() > 30 * 60_000) return res.status(400).json({ error: 'Check-in opens 30 minutes before the appointment.' });
  if (existing.endAt.getTime() <= Date.now()) return res.status(409).json({ error: 'This appointment has already ended and can no longer be checked in.' });
  const patientId = existing.patientId;
  if (!patientId) return res.status(404).json({ error: 'Booked appointment has no patient.' });
  const reference = appointmentReference(slotId);
  const checkedInAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.scheduleSlot.updateMany({ where: { id: slotId, status: SlotStatus.BOOKED, patientId }, data: { status: SlotStatus.OCCUPIED, checkedInAt, checkedInById: req.user!.id } });
    if (!updated.count) return null;
    return tx.receipt.upsert({ where: { slotId }, create: { slotId, patientId, reference }, update: {} });
  });
  if (!result) return res.status(409).json({ error: 'This appointment was checked in by another user.' });
  const receipt = result;
  void recordAppointmentNotification({ slotId, userId: patientId, email: existing.patient.email, event: 'CHECKED_IN', occurrenceId: receipt.id, receipt: { id: receipt.id, reference, patientName: `${existing.patient.firstName} ${existing.patient.lastName}`, doctor: `Dr. ${existing.doctor.user.firstName} ${existing.doctor.user.lastName}`, startAt: existing.startAt, checkedInAt }, reference, doctor: `Dr. ${existing.doctor.user.firstName} ${existing.doctor.user.lastName}`, startAt: existing.startAt, doctorUserId: existing.doctor.userId, patientName: `${existing.patient.firstName} ${existing.patient.lastName}` }).catch(() => undefined);
  res.json({ checkedIn: true, reference, receipt });
});

router.get('/appointments/:slotId/receipt', requireAuth, requireRole(Role.PATIENT, Role.FRONT_DESK, Role.ADMIN), async (req, res) => {
  const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;
  const receipt = await prisma.receipt.findUnique({ where: { slotId }, include: { slot: { include: { doctor: { include: { user: true, category: true } }, checkedInBy: { select: { firstName: true, lastName: true, role: true } } } }, patient: { select: { id: true, firstName: true, lastName: true, iin: true, phone: true } } } });
  if (!receipt) return res.status(404).json({ error: 'Receipt is not available until check-in succeeds.' });
  if (req.user!.role === Role.PATIENT && receipt.patientId !== req.user!.id) return res.status(403).json({ error: 'You can only view your own receipt.' });
  const { slot, patient } = receipt;
  const address = [slot.doctor.clinicName, slot.doctor.streetAddress, slot.doctor.city].filter(Boolean).join(', ');
  res.json({ receipt: {
    id: receipt.id,
    reference: receipt.reference,
    createdAt: receipt.createdAt,
    patientDisplayName: `${patient.firstName} ${patient.lastName}`,
    patientMaskedIin: patient.iin ? `${'•'.repeat(Math.max(0, patient.iin.length - 4))}${patient.iin.slice(-4)}` : null,
    doctor: `Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`,
    specialty: slot.doctor.category.name,
    consultationFee: slot.doctor.consultationFee,
    clinic: slot.doctor.clinicName ?? null,
    address: address || null,
    office: slot.doctor.officeNumber ?? slot.doctor.office,
    visitPurpose: slot.visitPurpose,
    startAt: slot.startAt,
    endAt: slot.endAt,
    checkedInAt: slot.checkedInAt,
    checkedInBy: slot.checkedInBy ? (slot.checkedInBy.role === Role.PATIENT ? 'Self check-in' : `${slot.checkedInBy.firstName} ${slot.checkedInBy.lastName}`) : null,
    status: slot.status,
  } });
});

router.get('/notifications', requireAuth, async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, type: true, channel: true, status: true, subject: true, message: true, createdAt: true, deliveredAt: true, readAt: true, slotId: true } }),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);
  res.json({ notifications, unreadCount });
});

router.post('/notifications/:id/read',requireAuth,async(req,res)=>{
  const result=await prisma.notification.updateMany({where:{id:String(req.params.id),userId:req.user!.id,readAt:null},data:{readAt:new Date()}});
  res.json({updated:result.count});
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  const result = await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ updated: result.count });
});

router.get('/front-desk/appointments', requireAuth, requireRole(Role.FRONT_DESK, Role.ADMIN), async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const appointments = await prisma.scheduleSlot.findMany({
    where: {
      status: { in: [SlotStatus.BOOKED, SlotStatus.OCCUPIED] },
      ...(query ? { OR: [
        { id: { contains: query, mode: 'insensitive' } },
        { patient: { OR: [{ firstName: { contains: query, mode: 'insensitive' } }, { lastName: { contains: query, mode: 'insensitive' } }, { iin: query }] } },
      ] } : {}),
    },
    orderBy: { startAt: 'asc' },
    take: 50,
    select: {
      id: true, startAt: true, endAt: true, status: true, visitPurpose: true, checkedInAt: true,
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      doctor: { select: { office: true, clinicName: true, user: { select: { firstName: true, lastName: true } }, category: { select: { name: true } } } },
    },
  });
  res.json({ appointments: appointments.map((slot) => ({ ...slot, reference: appointmentReference(slot.id), patient: slot.patient ? { id: slot.patient.id, name: `${slot.patient.firstName} ${slot.patient.lastName}`, email: slot.patient.email, phone: slot.patient.phone } : null, doctor: { name: `Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`, specialty: slot.doctor.category.name, office: slot.doctor.office ?? slot.doctor.clinicName } })) });
});

router.get('/front-desk/availability', requireAuth, requireRole(Role.FRONT_DESK, Role.ADMIN), async (req, res) => {
  const date = scheduleDateSchema.parse(typeof req.query.date === 'string' ? req.query.date : localDateAt(new Date(), 'Asia/Almaty'));
  // ?category=Cardiology&category=Neurology or ?category=Cardiology,Neurology
  const rawCategories = ([] as unknown[]).concat(req.query.category ?? []).flatMap((value) => typeof value === 'string' ? value.split(',') : []);
  const categories = Array.from(new Set(rawCategories.map((value) => value.trim()).filter(Boolean)));
  const q = typeof req.query.q === 'string' ? req.query.q.trim().replace(/^(?:dr\.?|doctor)\s+/i, '') : '';
  const bounds = clinicDateBounds(date);
  const now = new Date();
  const dayWindow = { status: SlotStatus.FREE, startAt: { gte: bounds.start, lt: bounds.end }, endAt: { gt: now } };
  // How many doctors have free time that day, per specialty (shown next to each option in the picker).
  const freeDoctors = await prisma.scheduleSlot.findMany({ where: dayWindow, distinct: ['doctorId'], select: { doctor: { select: { category: { select: { name: true } } } } } });
  const specialtyCounts: Record<string, number> = {};
  for (const row of freeDoctors ?? []) specialtyCounts[row.doctor.category.name] = (specialtyCounts[row.doctor.category.name] ?? 0) + 1;
  const slots = await prisma.scheduleSlot.findMany({
    where: {
      ...dayWindow,
      doctor: {
        ...(categories.length ? { category: { name: { in: categories } } } : {}),
        ...(q ? { user: { AND: q.split(/\s+/).map((term) => ({ OR: [{ firstName: { contains: term, mode: 'insensitive' as const } }, { lastName: { contains: term, mode: 'insensitive' as const } }] })) } } : {}),
      },
    },
    orderBy: { startAt: 'asc' },
    take: 2000,
    select: {
      id: true, startAt: true, endAt: true,
      doctor: { select: { id: true, office: true, officeNumber: true, clinicName: true, consultationFee: true, categoryId: true, category: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } },
    },
  });
  const byDoctor = new Map<string, { id: string; name: string; specialty: string; office: string | null; consultationFee: number; slots: Array<{ id: string; startAt: Date; endAt: Date }> }>();
  for (const slot of slots) {
    const doctor = slot.doctor;
    if (!byDoctor.has(doctor.id)) {
      byDoctor.set(doctor.id, { id: doctor.id, name: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`, specialty: doctor.category.name, office: doctor.officeNumber ?? doctor.office ?? doctor.clinicName, consultationFee: doctor.consultationFee, slots: [] });
    }
    byDoctor.get(doctor.id)!.slots.push({ id: slot.id, startAt: slot.startAt, endAt: slot.endAt });
  }
  const walkInFees = await currentVisitFees(Array.from(new Map(slots.map((slot) => [slot.doctor.id, slot.doctor])).values()), new Date());
  for (const entry of byDoctor.values()) entry.consultationFee = walkInFees.get(entry.id) ?? entry.consultationFee;
  // Insertion order already follows the earliest free slot, so the soonest doctors come first.
  res.json({ date, specialtyCounts, doctors: Array.from(byDoctor.values()) });
});

router.get('/front-desk/patients/lookup', requireAuth, requireRole(Role.FRONT_DESK, Role.ADMIN), async (req, res) => {
  const { iin } = parsed(walkInLookupSchema, { iin: req.query.iin });
  const patient = await prisma.user.findUnique({ where: { iin }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, iin: true, role: true } });
  if (!patient || patient.role !== Role.PATIENT) return res.status(404).json({ error: 'No patient was found for that IIN.' });
  res.json({ patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, email: patient.email, phone: patient.phone, iin: patient.iin } });
});

router.post('/front-desk/walk-ins', requireAuth, requireRole(Role.FRONT_DESK, Role.ADMIN), async (req, res) => {
  const input = parsed(walkInRegistrationSchema, req.body);
  const slot = await prisma.scheduleSlot.findFirst({ where: { id: input.slotId, doctorId: input.doctorId, status: SlotStatus.FREE, endAt: { gt: new Date() } }, select: { id: true, startAt: true, endAt: true, doctor: { select: { userId: true, office: true, user: { select: { firstName: true, lastName: true } } } } } });
  if (!slot) return res.status(409).json({ error: 'The selected slot is no longer available.' });
  const existing = await prisma.user.findUnique({ where: { iin: input.iin }, select: { id: true, role: true, email: true, firstName: true, lastName: true } });
  if (existing && existing.role !== Role.PATIENT) return res.status(409).json({ error: 'That IIN belongs to a non-patient account.' });
  if (!existing && !isValidIin(input.iin)) return res.status(400).json({ error: 'Enter a valid IIN.', details: [{ path: ['iin'], message: 'Enter a valid IIN.' }] });
  const result = await prisma.$transaction(async (tx) => {
    const patient = existing ?? await tx.user.create({ data: { firstName: input.firstName, lastName: input.lastName, iin: input.iin, email: input.email || `walkin-${randomToken()}@local.happypatient`, phone: input.phone || null, passwordHash: await hashPassword(randomToken()), role: Role.PATIENT }, select: { id: true, email: true, firstName: true, lastName: true } });
    const checkedInAt = new Date();
    const status = getWalkInSlotStatus(slot.startAt, checkedInAt) === 'occupied' ? SlotStatus.OCCUPIED : SlotStatus.BOOKED;
    const updated = await tx.scheduleSlot.updateMany({ where: { id: slot.id, doctorId: input.doctorId, status: SlotStatus.FREE, endAt: { gt: checkedInAt } }, data: { status, patientId: patient.id, visitPurpose: input.visitPurpose, ...(status === SlotStatus.OCCUPIED ? { checkedInAt, checkedInById: req.user!.id } : {}) } });
    if (!updated.count) throw new WalkInConflict();
    const receipt = status === SlotStatus.OCCUPIED ? await tx.receipt.upsert({ where: { slotId: slot.id }, create: { slotId: slot.id, patientId: patient.id, reference: appointmentReference(slot.id) }, update: {} }) : undefined;
    return { patient, receipt, status, checkedInAt };
  }).catch((error: unknown) => { if (error instanceof WalkInConflict) return null; throw error; });
  if (!result) return res.status(409).json({ error: 'The selected slot was booked by someone else.' });
  const { patient, receipt, status, checkedInAt } = result;
  void recordAppointmentNotification({ slotId: slot.id, userId: patient.id, email: patient.email, event: status === SlotStatus.OCCUPIED ? 'CHECKED_IN' : 'BOOKED', occurrenceId: receipt?.id ?? checkedInAt.toISOString(), receipt: receipt ? { id: receipt.id, reference: receipt.reference, patientName: `${patient.firstName} ${patient.lastName}`, doctor: `Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`, startAt: slot.startAt, checkedInAt } : undefined, reference: appointmentReference(slot.id), doctor: `Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`, startAt: slot.startAt, endAt: slot.endAt, office: slot.doctor.office, doctorUserId: slot.doctor.userId, patientName: `${patient.firstName} ${patient.lastName} (walk-in)` }).catch(() => undefined);
  res.status(201).json({ patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName }, slot: { id: slot.id, status }, reference: appointmentReference(slot.id), receipt });
});

router.patch('/doctors/me/schedule/:slotId', requireAuth, requireRole(Role.DOCTOR), async (req, res) => {
  const input = parsed(slotUpdateSchema, req.body);
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.id }, select: { id: true, office: true, user: { select: { firstName: true, lastName: true } } } });
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found.' });
  const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;
  const slot = await prisma.scheduleSlot.findFirst({ where: { id: slotId, doctorId: doctor.id }, select: { id: true, status: true, startAt: true, endAt: true, visitPurpose: true, updatedAt: true, patientId: true, checkedInAt: true, patient: { select: { email: true } } } });
  if (!slot) return res.status(404).json({ error: 'Schedule slot not found.' });
  if (slot.checkedInAt || (slot.status === SlotStatus.OCCUPIED && slot.patientId)) {
    return res.status(409).json({ error: 'Checked-in appointments cannot be changed through manual availability controls.' });
  }
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
    where: { id: slot.id, doctorId: doctor.id, status: slot.status, ...(slot.status === SlotStatus.OCCUPIED ? { patientId: null, checkedInAt: null } : {}) },
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
  if (input.releaseBooking && slot.patientId) {
    const doctorName = doctor.user ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : 'your doctor';
    const reason = input.cancellationReason ?? 'No reason given';
    await prisma.cancelledAppointment.create({ data: { slotId: slot.id, patientId: slot.patientId, doctorId: doctor.id, startAt: slot.startAt, endAt: slot.endAt, visitPurpose: slot.visitPurpose, reason, cancelledById: req.user!.id, cancelledByRole: Role.DOCTOR } })
      .catch((error: unknown) => console.error('Cancellation history could not be stored', { message: error instanceof Error ? error.message : String(error) }));
    void notifyUser({ userId: slot.patientId, email: slot.patient?.email, slotId: slot.id, type: 'APPOINTMENT_RELEASED', eventKey: `DOCTOR_CANCELLED:${slot.id}:${slot.patientId}:${slot.updatedAt?.toISOString() ?? slot.startAt.toISOString()}`, ...appointmentEmail('DOCTOR_CANCELLED', { doctor: doctorName, reference: appointmentReference(slot.id), slotId: slot.id, startAt: slot.startAt, endAt: slot.endAt, office: doctor.office, frontendUrl: config.FRONTEND_URL, reason }), message: `Your appointment ${appointmentReference(slot.id)} with ${doctorName} on ${formatAlmaty(slot.startAt)} was cancelled by the doctor. Reason: ${reason}. Please book another time.` });
  }
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

const adminUserUpdateSchema = z.object({
  role: z.enum(Role).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: z.string().trim().max(30).transform((value) => value || null).nullable().optional(),
});
router.patch('/admin/users/:id', requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const input = adminUserUpdateSchema.safeParse(req.body ?? {});
  if (!input.success) return res.status(400).json({ error: 'Check the role, name, email and phone values.' });
  const { role, status, firstName, lastName, email, phone } = input.data;

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
      location: { select: { id: true, name: true } },
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
      locationId: doctor.locationId,
      location: doctor.location,
      status: doctor.office ? 'verified' : 'pending',
      createdAt: doctor.createdAt,
      scheduleSlots: doctor.scheduleSlots,
    })),
  });
});

router.patch('/admin/doctors/:id/location',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const parsedLocation=z.object({locationId:z.string().nullable()}).safeParse(req.body);if(!parsedLocation.success)return res.status(400).json({error:'Choose a valid office location.'});
  const doctorId=String(req.params.id);const doctor=await prisma.doctor.findUnique({where:{id:doctorId},select:{id:true,locationId:true}});if(!doctor)return res.status(404).json({error:'Doctor not found.'});
  const location=parsedLocation.data.locationId?await activeOffice(parsedLocation.data.locationId):null;
  if(parsedLocation.data.locationId&&!location)return res.status(400).json({error:'Choose an active office under an active floor and city.'});
  const updated=await prisma.$transaction(async tx=>{const saved=await tx.doctor.update({where:{id:doctorId},data:{locationId:location?.id??null,office:location?.name??null,officeNumber:location?.name??null,city:location?.city??null},include:{location:true}});await tx.referenceDataAudit.create({data:{actorId:req.user!.id,entity:'doctor-office',entityId:doctorId,action:'assigned',oldValue:{locationId:doctor.locationId},newValue:{locationId:location?.id??null}}});return saved;});
  res.json({doctor:updated});
});

router.get('/admin/appointments', requireAuth, requireRole(Role.ADMIN), async (_req, res) => {
  const appointments = await prisma.scheduleSlot.findMany({
    where: { status: { in: ['BOOKED', 'OCCUPIED'] }, patientId: { not: null } },
    orderBy: { startAt: 'asc' },
    // Enough for the admin list to search and sort on the client.
    take: 1000,
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
    // Same wording as the doctor and patient screens.
    status: slot.status === 'OCCUPIED' ? 'Checked in' : 'Booked',
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

const pricingInput = z.object({
  kind:z.enum(['visit','treatment','parking']), amountKzt:z.number().int().min(0),
  ratePerHourKzt:z.number().int().min(0).nullable().optional(), freeMinutes:z.number().int().min(0).default(0),
  rounding:z.enum(['per_started_hour','per_minute']).default('per_started_hour'), dailyCapKzt:z.number().int().min(0).nullable().optional(),
  doctorId:z.string().nullable().optional(), categoryId:z.string().nullable().optional(),
  consultationType:z.string().trim().max(80).nullable().optional(), serviceCode:z.string().trim().max(80).nullable().optional(),
  serviceName:z.string().trim().max(120).nullable().optional(), officeId:z.string().nullable().optional(),
  effectiveFrom:z.coerce.date(), effectiveTo:z.coerce.date().nullable().optional(),
});
router.get('/admin/pricing',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const kind=typeof req.query.kind==='string'?req.query.kind:undefined;
  const active=typeof req.query.active==='string'?req.query.active:undefined;
  const rules=await prisma.pricingRule.findMany({where:{...(kind&&['visit','treatment','parking'].includes(kind)?{kind:kind as 'visit'|'treatment'|'parking'}:{}),...(active==='true'?{active:true}:active==='false'?{active:false}:{})},include:{category:{select:{name:true}},office:{select:{name:true}},createdBy:{select:{firstName:true,lastName:true}},audits:{orderBy:{createdAt:'desc'},take:10}},orderBy:[{kind:'asc'},{effectiveFrom:'desc'}]});
  res.json({rules});
});
router.post('/admin/pricing',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const parsedInput=pricingInput.safeParse(req.body);if(!parsedInput.success)return res.status(400).json({error:'Pricing values are invalid.'});
  const input=parsedInput.data;if(input.effectiveTo&&input.effectiveTo<=input.effectiveFrom)return res.status(400).json({error:'End date must follow start date.'});
  if(input.kind==='parking'&&input.ratePerHourKzt===undefined)return res.status(400).json({error:'A parking hourly rate is required.'});
  const scope={kind:input.kind,doctorId:input.doctorId??null,categoryId:input.categoryId??null,consultationType:input.consultationType??null,serviceCode:input.serviceCode??null,officeId:input.officeId??null};
  const collision=await prisma.pricingRule.findFirst({where:{...scope,active:true,effectiveFrom:{lt:input.effectiveTo??new Date('9999-12-31')},OR:[{effectiveTo:null},{effectiveTo:{gt:input.effectiveFrom}}]}});
  if(collision)return res.status(409).json({error:'An active rule already overlaps this scope and date range.'});
  const rule=await prisma.pricingRule.create({data:{...input,...scope,createdById:req.user!.id}});
  await prisma.pricingRuleAudit.create({data:{ruleId:rule.id,actorId:req.user!.id,action:'created',newValue:rule as unknown as Prisma.InputJsonValue}});
  res.status(201).json({rule});
});
router.patch('/admin/pricing/:id',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const id=String(req.params.id);const old=await prisma.pricingRule.findUnique({where:{id}});if(!old)return res.status(404).json({error:'Pricing rule not found.'});
  if(req.body?.active===false){const effectiveTo=old.effectiveFrom>new Date()?old.effectiveFrom:new Date();const [rule]=await prisma.$transaction([prisma.pricingRule.update({where:{id},data:{active:false,effectiveTo}}),prisma.pricingRuleAudit.create({data:{ruleId:id,actorId:req.user!.id,action:'deactivated',oldValue:old as unknown as Prisma.InputJsonValue,newValue:{active:false,effectiveTo:effectiveTo.toISOString()}}})]);return res.json({rule});}
  const parsedInput=pricingInput.safeParse({...old,...req.body});if(!parsedInput.success)return res.status(400).json({error:'Pricing values are invalid.'});
  const input=parsedInput.data;if(input.effectiveTo&&input.effectiveTo<=input.effectiveFrom)return res.status(400).json({error:'End date must follow start date.'});
  if(input.effectiveFrom<=old.effectiveFrom)return res.status(400).json({error:'A new version must start after the existing version.'});
  const scope={kind:input.kind,doctorId:input.doctorId??null,categoryId:input.categoryId??null,consultationType:input.consultationType??null,serviceCode:input.serviceCode??null,officeId:input.officeId??null};
  const collision=await prisma.pricingRule.findFirst({where:{...scope,id:{not:id},active:true,effectiveFrom:{lt:input.effectiveTo??new Date('9999-12-31')},OR:[{effectiveTo:null},{effectiveTo:{gt:input.effectiveFrom}}]}});
  if(collision)return res.status(409).json({error:'An active rule already overlaps this scope and date range.'});
  const version=await prisma.$transaction(async tx=>{const rule=await tx.pricingRule.create({data:{kind:input.kind,doctorId:input.doctorId??null,categoryId:input.categoryId??null,consultationType:input.consultationType??null,serviceCode:input.serviceCode??null,officeId:input.officeId??null,serviceName:input.serviceName??null,scopeKey:old.scopeKey,amountKzt:input.amountKzt,ratePerHourKzt:input.ratePerHourKzt??null,freeMinutes:input.freeMinutes,rounding:input.rounding,dailyCapKzt:input.dailyCapKzt??null,effectiveFrom:input.effectiveFrom,effectiveTo:input.effectiveTo??null,createdById:req.user!.id,versionOfId:id}});await tx.pricingRule.update({where:{id},data:{effectiveTo:input.effectiveFrom}});await tx.pricingRuleAudit.create({data:{ruleId:rule.id,actorId:req.user!.id,action:'versioned',oldValue:old as unknown as Prisma.InputJsonValue,newValue:rule as unknown as Prisma.InputJsonValue}});return rule;});
  res.status(201).json({rule:version});
});
/** Consultation price for every visit in a patient's list, using three queries in total. */
/** Visit price for a booking made at `at`, per doctor: the most specific active visit rule, else the doctor's fee. One query. */
async function currentVisitFees(doctors:Array<{id:string;categoryId:string;consultationFee:number}>,at:Date){
  const fees=new Map<string,number>();
  if(!doctors.length)return fees;
  const rules=(await prisma.pricingRule.findMany({where:{kind:'visit',effectiveFrom:{lte:at},OR:[{effectiveTo:null},{effectiveTo:{gt:at}}]}}))??[];
  for(const doctor of doctors){
    const rule=resolvePricingRule(rules as PricingRule[],'visit',at,doctor.id,doctor.categoryId);
    fees.set(doctor.id,calculateVisitCost(doctor.consultationFee,rule?{id:rule.id,amountKzt:rule.amountKzt}:undefined).consultationKzt);
  }
  return fees;
}
async function listPrices(slots:Array<{id:string;doctorId:string;updatedAt:Date;doctor:{consultationFee:number;categoryId:string}}>,userId:string){
  const prices=new Map<string,number>();
  if(!slots.length)return prices;
  const [bookings,rules]=await Promise.all([
    prisma.notification.findMany({where:{slotId:{in:slots.map(slot=>slot.id)},userId,type:'BOOKED'},orderBy:{createdAt:'desc'},select:{slotId:true,createdAt:true}}),
    prisma.pricingRule.findMany({where:{kind:'visit'}}),
  ]);
  const bookedAtBySlot=new Map<string,Date>();
  // Newest first, so the first row seen for a slot is its latest booking.
  for(const row of bookings??[])if(row.slotId&&!bookedAtBySlot.has(row.slotId))bookedAtBySlot.set(row.slotId,row.createdAt);
  for(const slot of slots){
    const bookedAt=bookedAtBySlot.get(slot.id)??slot.updatedAt;
    const visit=bookedAt?resolvePricingRule((rules??[]) as PricingRule[],'visit',bookedAt,slot.doctorId,slot.doctor.categoryId):undefined;
    prices.set(slot.id,calculateVisitCost(slot.doctor.consultationFee,visit?{id:visit.id,amountKzt:visit.amountKzt}:undefined).consultationKzt);
  }
  return prices;
}
/** Price of a booked visit with the rules in force when it was booked; shared by the list and the breakdown. */
async function visitCostFor(slot:{id:string;doctorId:string;startAt:Date;endAt:Date;updatedAt:Date;doctor:{consultationFee:number;categoryId:string;locationId:string|null}},userId:string){
  const bookingEvent=await prisma.notification.findFirst({where:{slotId:slot.id,userId,type:'BOOKED'},orderBy:{createdAt:'desc'},select:{createdAt:true}});
  const bookedAt=bookingEvent?.createdAt??slot.updatedAt;
  // The existing BOOKED notification timestamps the booking event; updatedAt is the fallback if that delivery row is absent.
  const rules=await prisma.pricingRule.findMany({where:{kind:{in:['visit','parking']},effectiveFrom:{lte:bookedAt},OR:[{effectiveTo:null},{effectiveTo:{gt:bookedAt}}]}});
  const visit=resolvePricingRule(rules as PricingRule[],'visit',bookedAt,slot.doctorId,slot.doctor.categoryId);
  const parking=resolvePricingRule(rules as PricingRule[],'parking',bookedAt,slot.doctorId,slot.doctor.categoryId,undefined,slot.doctor.locationId);
  const cost=calculateVisitCost(slot.doctor.consultationFee,visit?{id:visit.id,amountKzt:visit.amountKzt}:undefined);
  const duration=(slot.endAt.getTime()-slot.startAt.getTime())/60000;
  return {...cost,bookedAt,parking:parking?{durationMinutes:duration,amountKzt:calculateParkingCost(duration,parking)}:null};
}
router.get('/me/appointments/:slotId/cost',requireAuth,requireRole(Role.PATIENT),async(req,res)=>{
  const slot=await prisma.scheduleSlot.findFirst({where:{id:String(req.params.slotId),patientId:req.user!.id},include:{doctor:{select:{consultationFee:true,categoryId:true,locationId:true}}}});
  if(!slot)return res.status(404).json({error:'Visit not found.'});
  res.json(await visitCostFor(slot,req.user!.id));
});
// Demo clock: everyone reads the app time; only an admin can move it.
const timeState = () => ({ now: new Date().toISOString(), realNow: new Date(realNow()).toISOString(), offsetMinutes: Math.round(clockOffsetMs() / 60_000), enabled: timeControlEnabled() });
router.get('/time', (_req, res) => res.json(timeState()));
const MAX_OFFSET_MINUTES = 60 * 24 * 60;
router.post('/admin/time', requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  if (!timeControlEnabled()) return res.status(403).json({ error: 'Time control is turned off on this server.' });
  const input = z.union([
    z.object({ offsetMinutes: z.number().int().min(-MAX_OFFSET_MINUTES).max(MAX_OFFSET_MINUTES) }),
    z.object({ at: z.coerce.date() }),
  ]).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Choose an offset of up to 60 days or a valid date and time.' });
  const offsetMs = 'at' in input.data ? input.data.at.getTime() - realNow() : input.data.offsetMinutes * 60_000;
  if (Math.abs(offsetMs) > MAX_OFFSET_MINUTES * 60_000) return res.status(400).json({ error: 'The demo time can be at most 60 days from real time.' });
  setClockOffset(offsetMs);
  // Run the time-based jobs now so their effect is visible right away instead of on the next timer tick.
  const [released, reminders] = await Promise.all([
    releaseUnattendedSlots().catch(() => ({ count: 0 })),
    sendUpcomingReminders().catch(() => ({ count: 0 })),
  ]);
  res.json({ ...timeState(), released: released.count, reminders: reminders.count });
});
router.get('/admin/statistics',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const from=typeof req.query.from==='string'?new Date(req.query.from):new Date(Date.now()-7*86_400_000);
  const to=typeof req.query.to==='string'?new Date(req.query.to):new Date();
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to)return res.status(400).json({error:'Invalid date range.'});
  const period=typeof req.query.period==='string'?req.query.period:'day';if(!['day','week','month'].includes(period))return res.status(400).json({error:'Invalid report period.'});res.json(await getAdminStatistics(from,to,period as 'day'|'week'|'month'));
});
router.post('/admin/integrity/run',requireAuth,requireRole(Role.ADMIN),async(_req,res)=>{
  try{res.json(await runAndStoreIntegrity());}catch{res.status(500).json({error:'Integrity checks could not be completed.'});}
});
/** Refused medical-record reads and writes, newest first. Who tried, which action and whose record; never the record content. */
router.get('/admin/security/access-attempts',requireAuth,requireRole(Role.ADMIN),async(_req,res)=>{
  const since=new Date(Date.now()-7*24*60*60*1000);
  const [rows,lastWeek]=await Promise.all([
    prisma.historyAccessAudit.findMany({orderBy:{createdAt:'desc'},take:50,select:{id:true,createdAt:true,actorRole:true,endpoint:true,targetPatientId:true,actor:{select:{firstName:true,lastName:true}}}}),
    prisma.historyAccessAudit.count({where:{createdAt:{gte:since}}}),
  ]);
  const patientIds=Array.from(new Set((rows??[]).map(row=>row.targetPatientId).filter(id=>id&&id!=='unknown')));
  const patients=patientIds.length?(await prisma.user.findMany({where:{id:{in:patientIds},role:Role.PATIENT},select:{id:true,firstName:true,lastName:true}}))??[]:[];
  const patientName=new Map(patients.map(patient=>[patient.id,`${patient.firstName} ${patient.lastName}`]));
  res.json({lastWeek:lastWeek??0,attempts:(rows??[]).map(row=>({id:row.id,createdAt:row.createdAt,actor:row.actor?`${row.actor.firstName} ${row.actor.lastName}`:null,actorRole:row.actorRole,action:row.endpoint,patient:patientName.get(row.targetPatientId)??null}))});
});
router.get('/admin/integrity/runs',requireAuth,requireRole(Role.ADMIN),async(_req,res)=>res.json({runs:await prisma.integrityRun.findMany({orderBy:{startedAt:'desc'},take:30})}));
router.get('/admin/reference/categories',requireAuth,requireRole(Role.ADMIN),async(_req,res)=>res.json({categories:await prisma.category.findMany({include:{_count:{select:{doctors:true}}},orderBy:{name:'asc'}})}));
router.get('/admin/reference/locations',requireAuth,requireRole(Role.ADMIN),async(_req,res)=>{
  const locations=await prisma.location.findMany({include:{_count:{select:{doctors:true}},children:true,parent:true},orderBy:[{kind:'asc'},{name:'asc'}]});
  const usage=await prisma.$queryRawUnsafe<Array<{id:string;doctors:number;slots:number}>>(`SELECT l."id",COUNT(DISTINCT d."id")::int AS doctors,COUNT(DISTINCT s."id")::int AS slots
    FROM "Location" l
    LEFT JOIN "Location" f ON (l."kind"='city' AND f."kind"='floor' AND f."parentId"=l."id") OR (l."kind"='floor' AND f."id"=l."id") OR (l."kind"='office' AND f."id"=l."parentId")
    LEFT JOIN "Location" o ON (l."kind"='office' AND o."id"=l."id") OR (l."kind" IN ('city','floor') AND o."kind"='office' AND o."parentId"=f."id")
    LEFT JOIN "Doctor" d ON d."locationId"=o."id" LEFT JOIN "ScheduleSlot" s ON s."doctorId"=d."id"
    GROUP BY l."id"`);
  const byId=new Map(usage.map(row=>[row.id,{doctors:Number(row.doctors),slots:Number(row.slots)}]));
  res.json({locations:locations.map(location=>({...location,usage:byId.get(location.id)??{doctors:0,slots:0}}))});
});
router.get('/admin/reference/audit',requireAuth,requireRole(Role.ADMIN),async(_req,res)=>{
  const audits=await prisma.referenceDataAudit.findMany({orderBy:{createdAt:'desc'},take:50,include:{actor:{select:{firstName:true,lastName:true}}}});
  res.json({audits});
});
router.post('/admin/reference/locations',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const parsedInput=z.object({name:z.string().trim().min(1).max(120),kind:z.enum(['city','floor','office']),parentId:z.string().nullable().optional()}).safeParse(req.body);
  if(!parsedInput.success)return res.status(400).json({error:'Location values are invalid.'});
  const input=parsedInput.data;
  if((input.kind==='city'&&input.parentId)||(input.kind!=='city'&&!input.parentId))return res.status(400).json({error:'A city has no parent; floors and offices require their parent.'});
  if(input.parentId){const parent=await prisma.location.findUnique({where:{id:input.parentId}});const expected=input.kind==='floor'?'city':'floor';if(!parent||parent.kind!==expected||!parent.active)return res.status(400).json({error:'Choose an active parent of the correct type.'});}
  const duplicate=await prisma.location.findFirst({where:{parentId:input.parentId??null,name:{equals:input.name,mode:'insensitive'}}});
  if(duplicate)return res.status(409).json({error:'A location with this name already exists under that parent.'});
  const location=await prisma.$transaction(async tx=>{const created=await tx.location.create({data:{...input,parentId:input.parentId??null}});await tx.referenceDataAudit.create({data:{actorId:req.user!.id,entity:'location',entityId:created.id,action:'created',newValue:{name:created.name,kind:created.kind,parentId:created.parentId}}});return created;});
  res.status(201).json({location});
});
router.patch('/admin/reference/locations/:id',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const parsedInput=z.object({name:z.string().trim().min(1).max(120).optional(),active:z.boolean().optional(),parentId:z.string().nullable().optional(),confirmMove:z.boolean().optional()}).safeParse(req.body);
  if(!parsedInput.success)return res.status(400).json({error:'Location values are invalid.'});
  const input=parsedInput.data;const id=String(req.params.id);
  const old=await prisma.location.findUnique({where:{id}});
  if(!old)return res.status(404).json({error:'Location not found.'});
  const moving=input.parentId!==undefined&&input.parentId!==old.parentId;
  if(moving&&!input.confirmMove)return res.status(400).json({error:'Confirm the location move explicitly.'});
  if(input.name!==undefined){const duplicate=await prisma.location.findFirst({where:{id:{not:id},parentId:input.parentId??old.parentId,name:{equals:input.name,mode:'insensitive'}}});if(duplicate)return res.status(409).json({error:'A location with this name already exists under that parent.'});}
  if(input.active===false){const children=await prisma.location.count({where:{parentId:id,active:true}});if(children>0)return res.status(409).json({error:'Deactivate active child locations first.'});}
  if(input.active===true&&old.parentId){const parent=await prisma.location.findUnique({where:{id:old.parentId},select:{active:true}});if(!parent?.active)return res.status(409).json({error:'Reactivate the parent location first.'});}
  if(moving){
    if(input.parentId===id)return res.status(400).json({error:'A location cannot be its own parent.'});
    const parent=input.parentId?await prisma.location.findUnique({where:{id:input.parentId}}):null;
    const expected=old.kind==='floor'?'city':old.kind==='office'?'floor':null;
    if((expected&&!parent)||(expected&&parent?.kind!==expected)||(input.parentId&&!parent?.active)||(!expected&&input.parentId))return res.status(400).json({error:'Choose an active parent of the correct type.'});
  }
  const location=await prisma.$transaction(async tx=>{
    const updated=await tx.location.update({where:{id},data:{...(input.name!==undefined?{name:input.name}:{}),...(input.active!==undefined?{active:input.active}:{}),...(moving?{parentId:input.parentId}: {})}});
    let officeIds:string[]=[];let cityId:string|null=null;
    if(old.kind==='city'&&input.name!==undefined){
      cityId=id;const floors=await tx.location.findMany({where:{kind:'floor',parentId:id},select:{id:true}});
      const offices=await tx.location.findMany({where:{kind:'office',parentId:{in:floors.map(item=>item.id)}},select:{id:true}});officeIds=offices.map(item=>item.id);
    }else if(old.kind==='floor'&&(moving||input.name!==undefined)){
      cityId=moving?(input.parentId??null):old.parentId;
      const offices=await tx.location.findMany({where:{kind:'office',parentId:id},select:{id:true}});officeIds=offices.map(item=>item.id);
    }else if(old.kind==='office'&&(moving||input.name!==undefined)){
      officeIds=[id];const floor=await tx.location.findUnique({where:{id:moving?(input.parentId??''):old.parentId??''},select:{parentId:true}});cityId=floor?.parentId??null;
    }
    const city=cityId?await tx.location.findUnique({where:{id:cityId},select:{name:true}}):null;
    if(officeIds.length){
      const office=old.kind==='office'&&input.name!==undefined?input.name:undefined;
      const cityName=old.kind==='city'&&input.name!==undefined?input.name:city?.name;
      await tx.doctor.updateMany({where:{locationId:{in:officeIds}},data:{...(office!==undefined?{office}:{}),...(cityName?{city:cityName}:{})}});
    }
    await tx.referenceDataAudit.create({data:{actorId:req.user!.id,entity:'location',entityId:id,action:moving?'moved':input.active!==undefined&&input.active!==old.active?(input.active?'reactivated':'deactivated'):input.name!==undefined?'renamed':'updated',oldValue:{name:old.name,active:old.active,parentId:old.parentId},newValue:{name:updated.name,active:updated.active,parentId:updated.parentId}}});
    return updated;
  });
  res.json({location});
});
router.post('/admin/reference/categories',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const parsedInput=z.object({name:z.string().trim().min(2).max(80)}).safeParse(req.body);
  if(!parsedInput.success)return res.status(400).json({error:'Category name is invalid.'});
  const name=parsedInput.data.name;
  const duplicate=await prisma.category.findFirst({where:{name:{equals:name,mode:'insensitive'}}});
  if(duplicate)return res.status(409).json({error:'A category with this name already exists.'});
  const category=await prisma.$transaction(async tx=>{const created=await tx.category.create({data:{name}});await tx.referenceDataAudit.create({data:{actorId:req.user!.id,entity:'category',entityId:created.id,action:'created',newValue:{name:created.name,active:created.active}}});return created;});
  res.status(201).json({category});
});
router.patch('/admin/reference/categories/:id',requireAuth,requireRole(Role.ADMIN),async(req,res)=>{
  const parsedInput=z.object({name:z.string().trim().min(2).max(80).optional(),active:z.boolean().optional()}).safeParse(req.body);
  if(!parsedInput.success)return res.status(400).json({error:'Category values are invalid.'});
  const input=parsedInput.data;const id=String(req.params.id);
  const old=await prisma.category.findUnique({where:{id}});if(!old)return res.status(404).json({error:'Category not found.'});
  if(input.name!==undefined){const duplicate=await prisma.category.findFirst({where:{id:{not:id},name:{equals:input.name,mode:'insensitive'}}});if(duplicate)return res.status(409).json({error:'A category with this name already exists.'});}
  const category=await prisma.$transaction(async tx=>{const updated=await tx.category.update({where:{id},data:input});await tx.referenceDataAudit.create({data:{actorId:req.user!.id,entity:'category',entityId:id,action:input.active!==undefined&&input.active!==old.active?(input.active?'reactivated':'deactivated'):input.name!==undefined?'renamed':'updated',oldValue:{name:old.name,active:old.active},newValue:{name:updated.name,active:updated.active}}});return updated;});
  res.json({category});
});
export default router;
