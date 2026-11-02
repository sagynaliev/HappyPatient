import { prisma } from './prisma';
import { NO_CHECKIN_GRACE_MS } from './visitTime';
import { config } from './config';
import { sendReminderEmail } from './appointmentNotifications';

export async function releaseUnattendedSlots(now = new Date()) {
  const where = { status: 'BOOKED' as const, checkedInAt: null, startAt: { lte: new Date(now.getTime() - NO_CHECKIN_GRACE_MS) } };
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.scheduleSlot.findMany({ where });
    let count = 0;
    for (const slot of candidates) {
      // The conditional write acquires the row lock. Recheck the booking version so
      // concurrent jobs, check-in, or rebooking cannot expire a different visit.
      const released = await tx.scheduleSlot.updateMany({
        where: { ...where, id: slot.id, patientId: slot.patientId, updatedAt: slot.updatedAt },
        data: { status: 'FREE', patientId: null, visitPurpose: null, checkedInAt: null, checkedInById: null },
      });
      if (!released.count) continue;
      await tx.expiredAppointment.create({ data: {
        appointmentId: slot.id, slotId: slot.id, doctorId: slot.doctorId,
        patientId: slot.patientId, startAt: slot.startAt, endAt: slot.endAt,
        bookingVersion: slot.updatedAt, reason: 'auto_release_no_checkin', status: 'expired', createdAt: now,
      } });
      count += 1;
    }
    return { count };
  });
}

export async function sendUpcomingReminders(now = new Date()) {
  const windows = Array.from(new Set(config.REMINDER_LEAD_HOURS.split(',').map(Number).filter(hours=>Number.isFinite(hours)&&hours>0))).sort((a,b)=>b-a).map(hours=>({kind:String(hours)+'h',lead:hours*60*60_000})); let sent=0;
  for (const {kind,lead} of windows) {
    const slots=await prisma.scheduleSlot.findMany({where:{status:'BOOKED',startAt:{gt:now,lte:new Date(now.getTime()+lead)},patientId:{not:null}},include:{patient:true,doctor:{include:{user:true,location:{include:{parent:{include:{parent:true}}}}}}},take:500});
    for(const slot of slots){if(!slot.patient)continue;const shortestLead=Math.min(...windows.map(window=>window.lead));if(lead>shortestLead&&slot.startAt.getTime()-now.getTime()<=shortestLead)continue; try { await prisma.$transaction(async tx=>{await tx.reminderSent.create({data:{appointmentId:slot.id,bookingVersion:slot.updatedAt,kind}});const time=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Almaty'}).format(slot.startAt);const location=slot.doctor.location;const address=[slot.doctor.streetAddress,location?.name,location?.parent?.name,location?.parent?.parent?.name,slot.doctor.officeNumber?`Office ${slot.doctor.officeNumber}`:null].filter(Boolean).join(', ')||slot.doctor.clinicName||slot.doctor.office||'clinic';await tx.notification.create({data:{eventKey:`REMINDER:${slot.id}:${slot.updatedAt.toISOString()}:${kind}`,userId:slot.patientId!,slotId:slot.id,type:'VISIT_REMINDER',channel:'in-app',status:'DELIVERED',subject:'Upcoming appointment reminder',message:`Reminder: your visit with Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName} is ${time} (Asia/Almaty) at ${address}.`}});});{const loc=slot.doctor.location;const where=[slot.doctor.streetAddress,loc?.name,loc?.parent?.name,loc?.parent?.parent?.name,slot.doctor.officeNumber?`Office ${slot.doctor.officeNumber}`:null].filter(Boolean).join(', ')||slot.doctor.clinicName||slot.doctor.office||'clinic';await sendReminderEmail({eventKey:`REMINDER:${slot.id}:${slot.updatedAt.toISOString()}:${kind}`,email:slot.patient.email,slotId:slot.id,doctor:`Dr. ${slot.doctor.user.firstName} ${slot.doctor.user.lastName}`,reference:`HP-${slot.id.slice(-8).toUpperCase()}`,startAt:slot.startAt,endAt:slot.endAt,office:where});}sent++;}catch{/* Unique reminder key makes concurrent/repeated runs idempotent. */}}
  } return {count:sent};
}
