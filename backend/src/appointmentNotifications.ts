import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import { prisma } from './prisma';
import { config } from './config';
import { brandedEmail } from './email/layout';
import { appointmentEmail } from './email/appointment';
import { registrationReceiptPdf, RegistrationReceiptData } from './registrationReceipt';

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
  eventKey?: string;
  html?: string;
  text?: string;
  receipt?: RegistrationReceiptData;
}) {
  const base = {
    eventKey: input.eventKey ?? `${input.type.toLowerCase()}:${input.userId}:${randomUUID()}`,
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
    // Claim the unique event before contacting the provider. A racing worker cannot send it twice.
    const notification = await prisma.notification.create({ data: { ...base, channel: 'email', status: 'PENDING' } });
    let outcome: { status: string; error?: string; deliveredAt?: Date };
    try {
      if (input.type === 'CHECKED_IN' && !input.receipt) throw new Error('Registration receipt required');
      const content = input.html ? { html: input.html, text: input.text ?? input.message } : brandedEmail({ title: input.subject, message: input.message });
      const attachments = input.receipt ? [{ filename: `HappyPatient-registration-${input.receipt.reference}.pdf`, content: registrationReceiptPdf(input.receipt), contentType: 'application/pdf' }] : undefined;
      const result = await new Resend(config.RESEND_API_KEY).emails.send({ from: 'onboarding@resend.dev', to: input.email, subject: input.subject, ...content, attachments }, { idempotencyKey: base.eventKey });
      outcome = result.error ? { status: 'FAILED', error: 'Email provider rejected delivery' } : { status: 'DELIVERED', deliveredAt: new Date() };
    } catch {
      outcome = { status: 'FAILED', error: 'Email or receipt generation failed' };
    }
    await prisma.notification.updateMany({ where: { id: notification.id }, data: outcome });
    return { ...notification, ...outcome };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return null;
    console.error('Notification could not be stored', { type: input.type });
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
  occurrenceId?: string;
  receipt?: RegistrationReceiptData;
}) {
  const when = formatAlmaty(input.startAt);
  const eventKey = `${input.event}:${input.slotId}:${input.userId}:${input.occurrenceId ?? input.startAt.toISOString()}`;
  const content = appointmentEmail(input.event, input);
  const patient = await notifyUser({ eventKey: `${eventKey}:patient`, receipt: input.receipt, ...content, userId: input.userId, email: input.email, slotId: input.slotId, type: input.event, message: patientCopy[input.event](input.reference, input.doctor, when, input.reason).message });
  if (input.doctorUserId) {
    let patientName = input.patientName;
    if (!patientName) {
      const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { firstName: true, lastName: true } }).catch(() => null);
      patientName = user ? `${user.firstName} ${user.lastName}` : 'A patient';
    }
    await notifyUser({ eventKey: `${eventKey}:doctor`, userId: input.doctorUserId, slotId: input.slotId, type: input.event, ...doctorCopy[input.event](input.reference, patientName, when, input.reason) });
  }
  return patient;
}
