import { Router, Request, Response, NextFunction } from 'express';
import { Role, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { requireAuth } from './middleware';
import { canAccessMedicalHistory } from './medicalHistoryPolicy';
import { clockOffsetMs } from './clock';

export const medicalEntrySchema = z.object({
  appointmentId: z.string().min(1),
  category: z.enum(['test', 'anamnesis', 'conclusion']),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
});
const querySchema = z.object({
  offset: z.coerce.number().int().min(0).max(100000).default(0), direction: z.enum(['asc','desc']).default('asc'), category: z.enum(['test','anamnesis','conclusion']).optional(),
  // Visit scope: only one visit's notes, or everything except one visit (earlier history on a visit page).
  appointmentId: z.string().min(1).max(100).optional(), excludeAppointmentId: z.string().min(1).max(100).optional(),
  // Finding records in a long history: doctor's specialty, visit period and free text.
  specialty: z.string().trim().min(1).max(80).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), q: z.string().trim().min(1).max(100).optional(),
});
const include = { doctor: { select: { user: { select: { firstName: true, lastName: true } } } } };
// OCCUPIED is this project's checked-in/in-progress visit. After endAt it is
// completed; BOOKED and elapsed but unconfirmed visits never grant access.
/** Notes are written during or soon after the visit; later additions would look backdated. */
export const NOTE_WINDOW_MS = 24 * 60 * 60_000;
const eligibleVisit = (doctorUserId: string, patientId?: string): Prisma.ScheduleSlotWhereInput => ({
  doctor: { userId: doctorUserId }, ...(patientId ? { patientId } : {}),
  status: 'OCCUPIED', startAt: { lte: new Date() }, patient: { role: Role.PATIENT },
});
// Keep all unexpected ORM errors out of the global logger: they may include notes.
const privateRoute = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, _next: NextFunction) => { void handler(req, res).catch(() => res.status(500).json({ error: 'Unable to access medical history.' })); };
export const medicalHistoryRouter = Router();
medicalHistoryRouter.use('/medical-history', (req,res,next) => {
  res.set('Cache-Control','no-store');
  if(!req.header('authorization')) {
    const endpoint=req.method==='POST'?'create':req.path.endsWith('/export')?'export':req.path==='/'||req.path==='/medical-history'?'list':'get';
    void prisma.historyAccessAudit.create({data:{actorId:null,actorRole:null,targetPatientId:typeof req.query.patientId==='string'?req.query.patientId:'unknown',endpoint,outcome:'denied'}}).catch(()=>undefined);
    return res.status(401).json({error:'Authentication required.'});
  }
  return requireAuth(req,res,next);
});

medicalHistoryRouter.get('/medical-history', privateRoute(async (req, res) => {
  const query = querySchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Invalid history request.' });
  const patientId = req.user!.role === Role.PATIENT ? req.user!.id : typeof req.query.patientId === 'string' ? req.query.patientId : '';
  const allowed = await canAccessMedicalHistory(req.user, patientId);
  if (!allowed) {
    await prisma.historyAccessAudit.create({data:{actorId:req.user?.id,actorRole:req.user?.role,targetPatientId:patientId||'unknown',endpoint:'list',outcome:'denied'}}).catch(()=>undefined);
    return res.status(404).json({ error: 'History unavailable.' });
  }
  // For patients a supplied patientId is ignored; the session always owns the query.
  const q = query.data;
  const scope = Prisma.sql`e."patientId"=${patientId}
    ${q.appointmentId ? Prisma.sql`AND e."appointmentId"=${q.appointmentId}` : Prisma.empty}
    ${q.excludeAppointmentId ? Prisma.sql`AND e."appointmentId" IS DISTINCT FROM ${q.excludeAppointmentId}` : Prisma.empty}`;
  const filters = Prisma.sql`${scope}
    ${q.specialty ? Prisma.sql`AND c."name"=${q.specialty}` : Prisma.empty}
    ${q.from ? Prisma.sql`AND COALESCE(s."startAt", e."createdAt") >= ${q.from}` : Prisma.empty}
    ${q.to ? Prisma.sql`AND COALESCE(s."startAt", e."createdAt") < ${q.to}` : Prisma.empty}
    ${q.q ? Prisma.sql`AND (e."title" ILIKE ${'%' + q.q + '%'} OR e."body" ILIKE ${'%' + q.q + '%'})` : Prisma.empty}`;
  const from = Prisma.sql`FROM "MedicalEntry" e LEFT JOIN "ScheduleSlot" s ON s."id"=e."appointmentId"
      JOIN "Doctor" d ON d."id"=e."doctorId" JOIN "User" u ON u."id"=d."userId" JOIN "Category" c ON c."id"=d."categoryId"`;
  const direction = Prisma.raw(q.direction.toUpperCase());
  const [entries, grouped, specialties] = await Promise.all([
    prisma.$queryRaw<Array<{id:string;patientId:string;doctorId:string;appointmentId:string|null;category:string;title:string;body:string;createdAt:Date;updatedAt:Date;eventAt:Date;appointmentStartAt:Date|null;doctorFirstName:string;doctorLastName:string;specialty:string}>>(Prisma.sql`
      SELECT e."id", e."patientId", e."doctorId", e."appointmentId", e."category", e."title", e."body", e."createdAt", e."updatedAt",
        COALESCE(s."startAt", e."createdAt") AS "eventAt", s."startAt" AS "appointmentStartAt", u."firstName" AS "doctorFirstName", u."lastName" AS "doctorLastName", c."name" AS "specialty"
      ${from}
      WHERE ${filters} ${q.category ? Prisma.sql`AND e."category"=${q.category}::"MedicalEntryCategory"` : Prisma.empty}
      ORDER BY COALESCE(s."startAt",e."createdAt") ${direction}, e."createdAt" ${direction}, e."id" ${direction}
      OFFSET ${q.offset} LIMIT 21`),
    // Category counts follow the other filters, so the cards always match what the list can show.
    prisma.$queryRaw<Array<{category:string;count:number}>>(Prisma.sql`SELECT e."category"::text AS "category", COUNT(*)::int AS "count" ${from} WHERE ${filters} GROUP BY e."category"`),
    prisma.$queryRaw<Array<{name:string;count:number}>>(Prisma.sql`SELECT c."name" AS "name", COUNT(*)::int AS "count" ${from} WHERE ${scope} GROUP BY c."name" ORDER BY c."name"`),
  ]);
  return res.json({
    entries: entries.slice(0, 20).map(({doctorFirstName,doctorLastName,...entry})=>({...entry,doctor:{user:{firstName:doctorFirstName,lastName:doctorLastName}}})),
    hasMore: entries.length > 20,
    counts: Object.fromEntries((grouped ?? []).map(row => [row.category, Number(row.count)])),
    specialties: (specialties ?? []).map(row => ({ name: row.name, count: Number(row.count) })),
  });
}));
medicalHistoryRouter.get('/medical-history/export', privateRoute(async (req,res) => {
  const patientId=req.user!.role===Role.PATIENT?req.user!.id:typeof req.query.patientId==='string'?req.query.patientId:'';
  if(!await canAccessMedicalHistory(req.user,patientId)){await prisma.historyAccessAudit.create({data:{actorId:req.user?.id,actorRole:req.user?.role,targetPatientId:patientId||'unknown',endpoint:'export',outcome:'denied'}}).catch(()=>undefined);return res.status(404).json({error:'History unavailable.'});}
  const entries=await prisma.$queryRawUnsafe<Array<{id:string;patientId:string;doctorId:string;appointmentId:string|null;category:string;title:string;body:string;createdAt:Date;updatedAt:Date;eventAt:Date;doctorFirstName:string;doctorLastName:string}>>('SELECT e."id",e."patientId",e."doctorId",e."appointmentId",e."category",e."title",e."body",e."createdAt",e."updatedAt",COALESCE(s."startAt",e."createdAt") AS "eventAt",u."firstName" AS "doctorFirstName",u."lastName" AS "doctorLastName" FROM "MedicalEntry" e LEFT JOIN "ScheduleSlot" s ON s."id"=e."appointmentId" JOIN "Doctor" d ON d."id"=e."doctorId" JOIN "User" u ON u."id"=d."userId" WHERE e."patientId"=$1 ORDER BY COALESCE(s."startAt",e."createdAt") ASC,e."createdAt" ASC,e."id" ASC',patientId);
  return res.json({entries:entries.map(({doctorFirstName,doctorLastName,...entry})=>({...entry,doctor:{user:{firstName:doctorFirstName,lastName:doctorLastName}}}))});
}));
medicalHistoryRouter.get('/medical-history/:entryId', privateRoute(async (req,res) => {
  const entry=await prisma.medicalEntry.findUnique({where:{id:String(req.params.entryId)},include});
  const patientId=req.user!.role===Role.PATIENT?req.user!.id:entry?.patientId??(typeof req.query.patientId==='string'?req.query.patientId:'');
  if(!entry||!await canAccessMedicalHistory(req.user,patientId)){await prisma.historyAccessAudit.create({data:{actorId:req.user?.id,actorRole:req.user?.role,targetPatientId:patientId||'unknown',endpoint:'get',outcome:'denied'}}).catch(()=>undefined);return res.status(404).json({error:'History unavailable.'});}
  return res.json({entry});
}));
medicalHistoryRouter.post('/medical-history', privateRoute(async (req, res) => {
  if (req.user?.role !== Role.DOCTOR) {
    await prisma.historyAccessAudit.create({data:{actorId:req.user?.id,actorRole:req.user?.role,targetPatientId:'unknown',endpoint:'create',outcome:'denied'}}).catch(()=>undefined);
    return res.status(404).json({error:'History unavailable.'});
  }
  const input = medicalEntrySchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Choose a category and enter a title (1–120) and note (1–5000 characters).' });
  const entry = await prisma.$transaction(async tx => {
    // Demo clock: the database trigger stamps the entry with this time instead of its own clock.
    if (clockOffsetMs() !== 0) await tx.$executeRaw`SELECT set_config('app.now', ${new Date().toISOString()}, true)`;
    const visit = await tx.scheduleSlot.findFirst({ where: { id: input.data.appointmentId, doctor: {userId:req.user!.id}, status:'OCCUPIED', startAt:{lte:new Date()}, endAt:{gte:new Date(Date.now()-NOTE_WINDOW_MS)}, patient: {role:Role.PATIENT} }, select: { id: true, patientId: true, doctorId: true } });
    if (!visit?.patientId) return null;
    if (!await canAccessMedicalHistory(req.user, visit.patientId)) return null;
    return tx.medicalEntry.create({ data: { ...input.data, patientId: visit.patientId, doctorId: visit.doctorId }, include });
  });
  if (!entry) {
    await prisma.historyAccessAudit.create({data:{actorId:req.user?.id,actorRole:req.user?.role,targetPatientId:'unknown',endpoint:'create',outcome:'denied'}}).catch(()=>undefined);
    return res.status(404).json({ error: 'Visit unavailable for medical notes.' });
  }
  return res.status(201).json({ entry });
}));
