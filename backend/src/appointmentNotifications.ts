import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import { prisma } from './prisma';
import { config } from './config';

export type AppointmentEvent = 'BOOKED' | 'CANCELLED' | 'CHECKED_IN';
export type SystemEvent = 'WELCOME' | 'PROFILE_UPDATED' | 'PASSWORD_CHANGED' | 'SCHEDULE_CREATED' | 'APPOINTMENT_RELEASED';
export type NotificationType = AppointmentEvent | SystemEvent;

export const formatAlmaty = (value: Date) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Almaty' }).format(value);

/**
 * Stores a notification for one user (shown under the bell) and, when an email address and
 * RESEND_API_KEY are available, also emails it. Never throws: a failed notification must not
 * break the booking, cancellation or check-in that triggered it.
 */
export async function notifyUser(input: {
  userId: string;
  type: NotificationType;
  subject: string;
  message: string;
  slotId?: string;
  email?: string | null;
}) {
  const base = {
    eventKey: `${input.type.toLowerCase()}:${input.userId}:${randomUUID()}`,
    userId: input.userId,
    slotId: input.slotId,
    type: input.type,
    subject: input.subject,
    message: input.message,
  };
  try {
    if (!input.email || !config.RESEND_API_KEY) {
      return await prisma.notification.create({ data: { ...base, channel: 'in-app', status: 'RECORDED' } });
    }
    try {
      const result = await new Resend(config.RESEND_API_KEY).emails.send({ from: 'onboarding@resend.dev', to: input.email, subject: input.subject, text: input.message });
      if (!result.error) return await prisma.notification.create({ data: { ...base, channel: 'email', status: 'DELIVERED', deliveredAt: new Date() } });
      return await prisma.notification.create({ data: { ...base, channel: 'email', status: 'FAILED', error: result.error.message } });
    } catch (error: unknown) {
      return await prisma.notification.create({ data: { ...base, channel: 'email', status: 'FAILED', error: error instanceof Error ? error.message : 'Email delivery failed' } });
    }
  } catch (error: unknown) {
    console.error('Notification could not be stored', { type: input.type, userId: input.userId, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

const patientCopy: Record<AppointmentEvent, (ref: string, doctor: string, when: string, reason?: string) => { subject: string; message: string }> = {
  BOOKED: (ref, doctor, when) => ({ subject: 'Appointment booking confirmed', message: `Appointment booking confirmed. ${ref} with ${doctor} on ${when} (Asia/Almaty).` }),
  CANCELLED: (ref, doctor, when, reason) => ({ subject: 'Appointment cancellation confirmed', message: `Appointment cancellation confirmed. ${ref} with ${doctor} on ${when} (Asia/Almaty).${reason ? ` Reason: ${reason}` : ''}` }),
  CHECKED_IN: (ref, doctor, when) => ({ subject: 'Visit check-in confirmed', message: `Visit check-in confirmed. ${ref} with ${doctor} on ${when} (Asia/Almaty). Please wait to be called.` }),
};

const doctorCopy: Record<AppointmentEvent, (ref: string, patient: string, when: string, reason?: string) => { subject: string; message: string }> = {
  BOOKED: (ref, patient, when) => ({ subject: 'New appointment booked', message: `${patient} booked an appointment on ${when} (${ref}).` }),
  CANCELLED: (ref, patient, when, reason) => ({ subject: 'Appointment cancelled', message: `${patient} cancelled the appointment on ${when} (${ref}).${reason ? ` Reason: ${reason}.` : ''} The slot is free again.` }),
  CHECKED_IN: (ref, patient, when) => ({ subject: 'Patient has arrived', message: `${patient} checked in for the appointment on ${when} (${ref}).` }),
};

/** One appointment event notifies both sides: the patient and, when known, the doctor. */
export async function recordAppointmentNotification(input: {
  slotId: string;
  userId: string;
  email?: string | null;
  event: AppointmentEvent;
  reference: string;
  doctor: string;
  startAt: Date;
  doctorUserId?: string | null;
  patientName?: string;
  reason?: string;
}) {
  const when = formatAlmaty(input.startAt);
  const patient = await notifyUser({ userId: input.userId, email: input.email, slotId: input.slotId, type: input.event, ...patientCopy[input.event](input.reference, input.doctor, when, input.reason) });
  if (input.doctorUserId) {
    let patientName = input.patientName;
    if (!patientName) {
      const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { firstName: true, lastName: true } }).catch(() => null);
      patientName = user ? `${user.firstName} ${user.lastName}` : 'A patient';
    }
    await notifyUser({ userId: input.doctorUserId, slotId: input.slotId, type: input.event, ...doctorCopy[input.event](input.reference, patientName, when, input.reason) });
  }
  return patient;
}
