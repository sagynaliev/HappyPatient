import { prisma } from './prisma';
import { NO_CHECKIN_GRACE_MS } from './visitTime';
import { config } from './config';

export type IntegrityCheck = { id: string; name: string; description: string; count: number; severity: 'info'|'warning'|'critical'; sampleIds: string[] };
type CheckDefinition = Pick<IntegrityCheck,'id'|'name'|'description'|'severity'> & { sql: string; params?: unknown[] };

const CHECKS: CheckDefinition[] = [
  {id:'appointment-invalid-reference',name:'Appointments with missing patient or doctor',description:'Booked and occupied slots must point to a real patient and doctor.',severity:'critical',sql:`SELECT s."id" FROM "ScheduleSlot" s LEFT JOIN "Doctor" d ON d."id"=s."doctorId" LEFT JOIN "User" p ON p."id"=s."patientId" WHERE s."status" IN ('BOOKED','OCCUPIED') AND (d."id" IS NULL OR p."id" IS NULL)`},
  {id:'medical-entry-invalid-owner',name:'Medical entries with missing patient or doctor',description:'Each clinical entry must have a valid patient and doctor.',severity:'critical',sql:`SELECT e."id" FROM "MedicalEntry" e LEFT JOIN "User" p ON p."id"=e."patientId" LEFT JOIN "Doctor" d ON d."id"=e."doctorId" WHERE p."id" IS NULL OR d."id" IS NULL`},
  {id:'doctor-missing-reference',name:'Doctors without specialty or office',description:'A doctor needs an active category and a configured office location or legacy office name.',severity:'warning',sql:`SELECT d."id" FROM "Doctor" d LEFT JOIN "Category" c ON c."id"=d."categoryId" LEFT JOIN "Location" l ON l."id"=d."locationId" WHERE c."id" IS NULL OR (l."id" IS NULL AND NULLIF(BTRIM(COALESCE(d."office",d."clinicName",'')),'') IS NULL)`},
  {id:'user-empty-email',name:'Users with an empty required email',description:'Email is required by the user schema and must not be blank.',severity:'warning',sql:`SELECT u."id" FROM "User" u WHERE NULLIF(BTRIM(u."email"),'') IS NULL`},
  {id:'duplicate-patient-email',name:'Patients with duplicate normalized email',description:'Patient emails are compared after trimming and lowercasing.',severity:'warning',sql:`SELECT MIN(u."id") AS id FROM "User" u WHERE u."role"='PATIENT' GROUP BY LOWER(BTRIM(u."email")) HAVING COUNT(*)>1`},
  {id:'duplicate-patient-phone',name:'Patients with duplicate normalized phone',description:'Non-empty patient phones are compared after removing punctuation and spaces.',severity:'warning',sql:`SELECT MIN(u."id") AS id FROM "User" u WHERE u."role"='PATIENT' AND NULLIF(BTRIM(u."phone"),'') IS NOT NULL GROUP BY REGEXP_REPLACE(u."phone",'[^0-9+]','','g') HAVING COUNT(*)>1`},
  {id:'overlapping-doctor-slots',name:'Overlapping slots for the same doctor',description:'Two time slots for one doctor must not overlap.',severity:'critical',sql:`SELECT DISTINCT a."id" FROM "ScheduleSlot" a JOIN "ScheduleSlot" b ON b."doctorId"=a."doctorId" AND b."id">a."id" AND a."startAt"<b."endAt" AND b."startAt"<a."endAt"`},
  {id:'slot-status-inconsistent',name:'Slot status and patient/check-in fields disagree',description:'Free slots have no patient; booked slots have a patient and no check-in; occupied slots have both.',severity:'critical',sql:`SELECT s."id" FROM "ScheduleSlot" s WHERE (s."status"='FREE' AND s."patientId" IS NOT NULL) OR (s."status"='BOOKED' AND (s."patientId" IS NULL OR s."checkedInAt" IS NOT NULL)) OR (s."status"='OCCUPIED' AND (s."patientId" IS NULL OR s."checkedInAt" IS NULL))`},
  {id:'overdue-unchecked-booking',name:'Overdue bookings without check-in',description:'Bookings past the configured grace period should have been released or checked in.',severity:'warning',sql:`SELECT s."id" FROM "ScheduleSlot" s WHERE s."status"='BOOKED' AND s."checkedInAt" IS NULL AND s."startAt"<=$1`,params:[new Date()]},
  {id:'medical-entry-future',name:'Medical entries with a future creation time',description:'Server-created medical records cannot be dated in the future.',severity:'warning',sql:`SELECT e."id" FROM "MedicalEntry" e WHERE e."createdAt">$1`,params:[new Date()]},
  {id:'medical-entry-before-account',name:'Medical entries before patient account creation',description:'Clinical records cannot predate the associated patient account.',severity:'warning',sql:`SELECT e."id" FROM "MedicalEntry" e JOIN "User" p ON p."id"=e."patientId" WHERE e."createdAt"<p."createdAt"`},
  {id:'medical-entry-before-visit',name:'Medical entries before linked visit',description:'A record linked to an appointment cannot predate the visit start.',severity:'warning',sql:`SELECT e."id" FROM "MedicalEntry" e JOIN "ScheduleSlot" s ON s."id"=e."appointmentId" WHERE e."createdAt"<s."startAt"`},
  {id:'medical-entry-invalid-timestamps',name:'Medical entry timestamps are inconsistent',description:'An entry updated timestamp cannot be earlier than its creation timestamp.',severity:'critical',sql:`SELECT e."id" FROM "MedicalEntry" e WHERE e."updatedAt"<e."createdAt"`},
  {id:'medical-entry-sequence-gap',name:'Medical history sequence is not monotonic',description:'Each patient history must have contiguous, increasing server-assigned sequence numbers.',severity:'critical',sql:`WITH numbered AS (SELECT e."id",e."patientSequence",ROW_NUMBER() OVER(PARTITION BY e."patientId" ORDER BY e."patientSequence") AS expected FROM "MedicalEntry" e) SELECT "id" FROM numbered WHERE "patientSequence"<>expected`},
  {id:'duplicate-medical-entry',name:'Near-duplicate medical entries',description:'Same patient, doctor, category, title and body within five minutes may be accidental duplicates.',severity:'warning',sql:`SELECT DISTINCT a."id" FROM "MedicalEntry" a JOIN "MedicalEntry" b ON b."patientId"=a."patientId" AND b."doctorId"=a."doctorId" AND b."category"=a."category" AND b."title"=a."title" AND b."body"=a."body" AND b."id">a."id" AND ABS(EXTRACT(EPOCH FROM(b."createdAt"-a."createdAt")))<=300`},
  {id:'invalid-office-hierarchy',name:'Office hierarchy is invalid',description:'Cities have no parent; floors belong to cities; offices belong to floors.',severity:'critical',sql:`SELECT l."id" FROM "Location" l LEFT JOIN "Location" p ON p."id"=l."parentId" WHERE (l."kind"='city' AND l."parentId" IS NOT NULL) OR (l."kind"='floor' AND (p."id" IS NULL OR p."kind"<>'city')) OR (l."kind"='office' AND (p."id" IS NULL OR p."kind"<>'floor'))`},
];

export async function collectIntegrityChecks(now = new Date()): Promise<IntegrityCheck[]> {
  const graceCutoff = new Date(now.getTime() - NO_CHECKIN_GRACE_MS);
  return Promise.all(CHECKS.map(async check => {
    const params = (check.params ?? []).map(value => value instanceof Date && check.id==='overdue-unchecked-booking' ? graceCutoff : value instanceof Date ? now : value);
    const rows = await prisma.$queryRawUnsafe<Array<{id:string;total:number}>>(`WITH affected AS (${check.sql}) SELECT COUNT(*) OVER()::int AS total,id FROM affected LIMIT 10`, ...params);
    return {id:check.id,name:check.name,description:check.description,severity:rows.length?check.severity:'info',count:Number(rows[0]?.total??0),sampleIds:rows.map(row=>row.id)};
  }));
}

export async function runAndStoreIntegrity() {
  const run=await prisma.integrityRun.create({data:{}});
  try {
    const checks=await collectIntegrityChecks();
    const stored=await prisma.integrityRun.update({where:{id:run.id},data:{finishedAt:new Date(),status:'complete',results:checks}});
    return {runId:stored.id,checkedAt:stored.finishedAt,checks};
  } catch (error) {
    await prisma.integrityRun.update({where:{id:run.id},data:{finishedAt:new Date(),status:'failed'}});
    throw error;
  }
}

export async function runDailyIntegrityIfDue(now = new Date(), intervalMs = config.INTEGRITY_INTERVAL_MS) {
  const recent=await prisma.integrityRun.findFirst({where:{status:'complete',startedAt:{gte:new Date(now.getTime()-intervalMs)}},select:{id:true}});
  if (recent) return null;
  return runAndStoreIntegrity();
}

export async function getAdminStatistics(from: Date, to: Date, period: 'day'|'week'|'month' = 'day') {
  const [statuses,cancelled,expired,patientTypes,timeSeries,specialties,offices,workload]=await Promise.all([
    prisma.scheduleSlot.groupBy({by:['status'],where:{startAt:{gte:from,lt:to}},_count:true}),
    prisma.cancelledAppointment.count({where:{startAt:{gte:from,lt:to}}}),
    prisma.expiredAppointment.count({where:{startAt:{gte:from,lt:to}}}),
    prisma.$queryRawUnsafe<Array<{newPatients:number;returningPatients:number}>>(
      'WITH first_visits AS (SELECT s."patientId",MIN(s."startAt") AS first_visit FROM "ScheduleSlot" s WHERE s."patientId" IS NOT NULL AND s."status"=$1::"SlotStatus" AND s."startAt"<$3 GROUP BY s."patientId"), active_patients AS (SELECT DISTINCT s."patientId" FROM "ScheduleSlot" s WHERE s."patientId" IS NOT NULL AND s."status"=$1::"SlotStatus" AND s."startAt">=$2 AND s."startAt"<$3) SELECT COUNT(*) FILTER(WHERE f.first_visit>=$2 AND f.first_visit<$3)::int AS "newPatients",COUNT(*) FILTER(WHERE f.first_visit<$2)::int AS "returningPatients" FROM active_patients a JOIN first_visits f USING("patientId")',
      'OCCUPIED',from,to),
    prisma.$queryRawUnsafe<Array<{period:string;visits:number}>>(
      'SELECT CASE WHEN $1::text=$4 THEN to_char(date_trunc($1::text,s."startAt" AT TIME ZONE $5),$6) ELSE to_char(date_trunc($1::text,s."startAt" AT TIME ZONE $5),$7) END AS period,COUNT(*)::int AS visits FROM "ScheduleSlot" s WHERE s."startAt">=$2 AND s."startAt"<$3 AND s."status" IN ($8::"SlotStatus",$9::"SlotStatus") GROUP BY 1 ORDER BY 1',
      period,from,to,'month','Asia/Almaty','YYYY-MM','YYYY-MM-DD','BOOKED','OCCUPIED'),
    prisma.$queryRawUnsafe<Array<{name:string;visits:number}>>(
      'SELECT c."name",COUNT(*)::int AS visits FROM "ScheduleSlot" s JOIN "Doctor" d ON d."id"=s."doctorId" JOIN "Category" c ON c."id"=d."categoryId" WHERE s."startAt">=$1 AND s."startAt"<$2 AND s."status" IN ($3::"SlotStatus",$4::"SlotStatus") GROUP BY c."name" ORDER BY visits DESC',
      from,to,'BOOKED','OCCUPIED'),
    prisma.$queryRawUnsafe<Array<{name:string;visits:number}>>(
      'SELECT COALESCE(l."name",d."office",d."clinicName",$3)::text AS name,COUNT(*)::int AS visits FROM "ScheduleSlot" s JOIN "Doctor" d ON d."id"=s."doctorId" LEFT JOIN "Location" l ON l."id"=d."locationId" WHERE s."startAt">=$1 AND s."startAt"<$2 AND s."status" IN ($4::"SlotStatus",$5::"SlotStatus") GROUP BY 1 ORDER BY visits DESC',
      from,to,'Unspecified','BOOKED','OCCUPIED'),
    prisma.$queryRawUnsafe<Array<{doctorId:string;doctorName:string;specialty:string;bookedCount:number;completedCount:number;bookedMinutes:number;availableMinutes:number;utilization:number;averageAppointmentsPerWorkingDay:number;cancelled:number;expired:number;office:string}>>(
      'SELECT d."id" AS "doctorId",concat(u."firstName",chr(32),u."lastName") AS "doctorName",c."name" AS specialty,COUNT(s."id") FILTER(WHERE s."status"=$3::"SlotStatus")::int AS "bookedCount",COUNT(s."id") FILTER(WHERE s."status"=$4::"SlotStatus")::int AS "completedCount",COALESCE(SUM(EXTRACT(EPOCH FROM(s."endAt"-s."startAt"))/60) FILTER(WHERE s."status" IN ($3::"SlotStatus",$4::"SlotStatus")),0)::int AS "bookedMinutes",COALESCE(SUM(EXTRACT(EPOCH FROM(s."endAt"-s."startAt"))/60),0)::int AS "availableMinutes",COALESCE((SUM(EXTRACT(EPOCH FROM(s."endAt"-s."startAt"))/60) FILTER(WHERE s."status" IN ($3::"SlotStatus",$4::"SlotStatus")))/NULLIF(SUM(EXTRACT(EPOCH FROM(s."endAt"-s."startAt"))/60),0),0)::float AS utilization,COALESCE(COUNT(s."id") FILTER(WHERE s."status" IN ($3::"SlotStatus",$4::"SlotStatus"))::numeric/NULLIF(COUNT(DISTINCT (s."startAt" AT TIME ZONE $5)::date),0),0)::float AS "averageAppointmentsPerWorkingDay",(SELECT COUNT(*)::int FROM "CancelledAppointment" ca WHERE ca."doctorId"=d."id" AND ca."startAt">=$1 AND ca."startAt"<$2) AS cancelled,(SELECT COUNT(*)::int FROM "ExpiredAppointment" ea WHERE ea."doctorId"=d."id" AND ea."startAt">=$1 AND ea."startAt"<$2) AS expired,COALESCE(l."name",d."office",d."clinicName",$6)::text AS office FROM "Doctor" d JOIN "User" u ON u."id"=d."userId" JOIN "Category" c ON c."id"=d."categoryId" LEFT JOIN "Location" l ON l."id"=d."locationId" LEFT JOIN "ScheduleSlot" s ON s."doctorId"=d."id" AND s."startAt">=$1 AND s."startAt"<$2 GROUP BY d."id",u."firstName",u."lastName",c."name",l."name",d."office",d."clinicName" ORDER BY "bookedMinutes" DESC',
      from,to,'BOOKED','OCCUPIED','Asia/Almaty','Unspecified'),
  ]);
  const count=(status:string)=>Number(statuses.find(row=>row.status===status)?._count??0);
  const totalVisits=count('BOOKED')+count('OCCUPIED');
  const expiredTotal=expired;
  const noShowDenominator=totalVisits+expiredTotal;
  const availableMinutes=workload.reduce((sum,row)=>sum+Number(row.availableMinutes),0);
  const bookedMinutes=workload.reduce((sum,row)=>sum+Number(row.bookedMinutes),0);
  return {
    from,to,period,totalVisits,cancelled,expired:expiredTotal,noShowRate:noShowDenominator?expiredTotal/noShowDenominator:0,
    utilization:availableMinutes?bookedMinutes/availableMinutes:0,
    newPatients:Number(patientTypes[0]?.newPatients??0),returningPatients:Number(patientTypes[0]?.returningPatients??0),
    byStatus:[...statuses.map(row=>({status:row.status,count:row._count})),{status:'CANCELLED',count:cancelled},{status:'EXPIRED',count:expiredTotal}],
    timeSeries:timeSeries.map(row=>({period:row.period,visits:Number(row.visits)})),
    bySpecialty:specialties.map(row=>({name:row.name,visits:Number(row.visits)})),
    byOffice:offices.map(row=>({name:row.name,visits:Number(row.visits)})),
    doctorWorkload:workload.map(row=>({...row,bookedCount:Number(row.bookedCount),completedCount:Number(row.completedCount),bookedMinutes:Number(row.bookedMinutes),availableMinutes:Number(row.availableMinutes),utilization:Number(row.utilization),averageAppointmentsPerWorkingDay:Number(row.averageAppointmentsPerWorkingDay),cancelled:Number(row.cancelled),expired:Number(row.expired)})),
  };
}
