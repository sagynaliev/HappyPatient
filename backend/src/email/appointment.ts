import { brandedEmail, platformUrl } from './layout';
export const appointmentDate = (value: Date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Asia/Almaty' }).format(value);
export const appointmentTime = (value: Date) => new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Almaty' }).format(value);
export type PatientEmailEvent = 'BOOKED' | 'CANCELLED' | 'DOCTOR_CANCELLED' | 'CHECKED_IN';
export type AppointmentEmailData = { doctor: string; reference: string; slotId?: string; startAt: Date; endAt?: Date; office?: string | null; frontendUrl?: string; reason?: string };
const copy = {
  BOOKED: { subject: 'Appointment Confirmed | Happy Patient', title: 'Your appointment is confirmed!', message: 'Your visit has been booked successfully. We look forward to welcoming you.', nextStep: 'Please arrive on time. You can manage your appointment in Happy Patient.', status: 'Confirmed', tone: 'blue' },
  CANCELLED: { subject: 'Appointment Cancelled | Happy Patient', title: 'Your appointment has been cancelled', message: 'Your cancellation has been confirmed. The appointment details below are for your records.', nextStep: 'You can book another appointment whenever you are ready.', status: 'Cancelled by patient', tone: 'neutral' },
  DOCTOR_CANCELLED: { subject: 'Appointment Cancelled by Doctor | Happy Patient', title: 'Your doctor has cancelled the appointment', message: 'Your doctor has cancelled the visit listed below. We understand this may affect your plans.', nextStep: 'Please visit Happy Patient to book another appointment at a convenient time.', status: 'Cancelled by doctor', tone: 'neutral' },
  CHECKED_IN: { subject: 'Visit Check-in Confirmed | Happy Patient', title: "You're checked in!", message: 'Your arrival has been successfully confirmed. Please wait for the medical staff to call you.', nextStep: 'Your visit registration receipt is attached as a PDF. Keep it as proof of registration.', status: 'Checked In', tone: 'success' },
} as const;
export function appointmentEmail(event: PatientEmailEvent, data: AppointmentEmailData) {
  const content = copy[event];
  const timeRange = data.endAt ? `${appointmentTime(data.startAt)} to ${appointmentTime(data.endAt)}` : appointmentTime(data.startAt);
  const details: Array<[string, string]> = [['Doctor', data.doctor], ['Appointment date', appointmentDate(data.startAt)], ['Appointment time', `${timeRange} (Asia/Almaty)`]];
  if (data.office) details.push(['Office / location', data.office]);
  details.push(['Booking ID', data.reference], ['Status', content.status]);
  if ((event === 'DOCTOR_CANCELLED' || event === 'CANCELLED') && data.reason) details.push(['Cancellation reason', data.reason]);
  const baseUrl = platformUrl(data.frontendUrl);
  const action = baseUrl ? event === 'BOOKED' && data.slotId
    ? { label: 'Manage appointment', url: `${baseUrl}/appointments?appointmentId=${encodeURIComponent(data.slotId)}` }
    : event === 'CANCELLED' || event === 'DOCTOR_CANCELLED'
      ? { label: 'Book another appointment', url: `${baseUrl}/search` }
      : undefined : undefined;
  return { subject: content.subject, ...brandedEmail({ ...content, details, action }) };
}

/** Reminder sent before a booked visit; same facts as the in-app reminder plus a link to manage the booking. */
export function reminderEmail(data: AppointmentEmailData) {
  const timeRange = data.endAt ? `${appointmentTime(data.startAt)} to ${appointmentTime(data.endAt)}` : appointmentTime(data.startAt);
  const details: Array<[string, string]> = [['Doctor', data.doctor], ['Appointment date', appointmentDate(data.startAt)], ['Appointment time', `${timeRange} (Asia/Almaty)`]];
  if (data.office) details.push(['Office / location', data.office]);
  details.push(['Booking ID', data.reference]);
  const baseUrl = platformUrl(data.frontendUrl);
  const action = data.slotId ? { label: 'Manage appointment', url: `${baseUrl}/appointments?appointmentId=${encodeURIComponent(data.slotId)}` } : undefined;
  return {
    subject: 'Upcoming Appointment Reminder | Happy Patient',
    ...brandedEmail({
      title: 'Your visit is coming up',
      message: 'This is a reminder about your upcoming appointment.',
      details,
      nextStep: 'Please arrive 10 minutes early. Check-in at the front desk opens 30 minutes before your visit. If your plans changed, you can cancel or change the booking in Happy Patient.',
      tone: 'blue',
      action,
    }),
  };
}
