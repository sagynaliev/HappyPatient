import { Role } from '@prisma/client'; import { prisma } from './prisma';
export type HistoryActor={id:string;role:Role};
/** Assigned = a future BOOKED visit or an OCCUPIED (checked-in/completed) visit; cancelled snapshots and overdue unconfirmed bookings do not qualify. */
export async function canAccessMedicalHistory(actor:HistoryActor|undefined,patientId:string){if(!actor)return false;if(actor.role===Role.PATIENT)return actor.id===patientId;if(actor.role!==Role.DOCTOR)return false;
  return Boolean(await prisma.scheduleSlot.findFirst({where:{patientId,doctor:{userId:actor.id},OR:[{status:'OCCUPIED'},{status:'BOOKED',startAt:{gt:new Date()}}]},select:{id:true}}));}
