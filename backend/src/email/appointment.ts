import { brandedEmail, platformUrl } from './layout';
export const appointmentDate = (value: Date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Asia/Almaty' }).format(value);
export const appointmentTime = (value: Date) => new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Almaty' }).format(value);
export type PatientEmailEvent = 'BOOKED' | 'CANCELLED' | 'DOCTOR_CANCELLED' | 'CHECKED_IN';
export type AppointmentEmailData = { doctor: string; reference: string; slotId?: string; startAt: Date; endAt?: Date; office?: string | null; frontendUrl?: string; reason?: string };
const copy = {
  BOOKED: { subject: 'Appointment Confirmed | Happy Patient', title: 'Your appointment is confirmed', message: 'Your visit is booked. We look forward to seeing you.', status: 'Confirmed', tone: 'success', steps: [
    { title: 'Arrive 10 minutes early', text: 'Bring your ID card so the front desk can find you by IIN.' },
    { title: 'Check in at the front desk', text: 'Check-in opens 30 minutes before your visit.' },
    { title: 'Get your receipt', text: 'After check-in you can download or print it in Happy Patient.' },
  ] },
  CANCELLED: { subject: 'Appointment Cancelled | Happy Patient', title: 'Your appointment is cancelled', message: 'Your cancellation is confirmed. The details below are for your records.', status: 'Cancelled by patient', tone: 'danger', steps: [
    { title: 'The time is free again', text: 'Other patients can now book this slot.' },
    { title: 'Book again any time', text: 'Choose a doctor and a new time whenever you are ready.' },
  ] },
  DOCTOR_CANCELLED: { subject: 'Appointment Cancelled by Doctor | Happy Patient', title: 'Your doctor cancelled the visit', message: 'We are sorry, your doctor could not keep this appointment.', status: 'Cancelled by doctor', tone: 'danger', steps: [
    { title: 'Your booking is removed', text: 'This time is no longer reserved for you, so there is nothing more to do for it.' },
    { title: 'Choose a new time', text: 'Book another time with this doctor or a different specialist.' },
  ] },
  CHECKED_IN: { subject: 'Visit Check-in Confirmed | Happy Patient', title: "You're checked in!", message: 'Your arrival is confirmed. Please take a seat, the medical staff will call you.', status: 'Checked in', tone: 'success', steps: [
    { title: 'Wait to be called', text: 'Your doctor will invite you in at your appointment time.' },
    { title: 'Keep your receipt', text: 'Your visit registration receipt is attached as a PDF as proof of registration.' },
  ] },
} as const;
export function appointmentEmail(event: PatientEmailEvent, data: AppointmentEmailData) {
  const content = copy[event];
  const visit = { doctor: data.doctor, startAt: data.startAt, endAt: data.endAt, office: data.office };
  const details: Array<[string, string]> = [['Booking ID', data.reference]];
  if ((event === 'DOCTOR_CANCELLED' || event === 'CANCELLED') && data.reason) details.push(['Cancellation reason', data.reason]);
  const baseUrl = platformUrl(data.frontendUrl);
  const action = baseUrl ? event === 'BOOKED' && data.slotId
    ? { label: 'Manage appointment', url: `${baseUrl}/appointments?appointmentId=${encodeURIComponent(data.slotId)}` }
    : event === 'CANCELLED' || event === 'DOCTOR_CANCELLED'
      ? { label: 'Book another appointment', url: `${baseUrl}/search` }
      : undefined : undefined;
  const secondary = event === 'BOOKED' || event === 'CHECKED_IN' ? { label: 'View all appointments', url: `${baseUrl}/appointments` } : undefined;
  return { subject: content.subject, ...brandedEmail({ ...content, steps: [...content.steps], details, action, secondary, visit }) };
}

/** Reminder sent before a booked visit; same facts as the in-app reminder plus a link to manage the booking. */
export function reminderEmail(data: AppointmentEmailData) {
  const visit = { doctor: data.doctor, startAt: data.startAt, endAt: data.endAt, office: data.office };
  const details: Array<[string, string]> = [['Booking ID', data.reference]];
  const baseUrl = platformUrl(data.frontendUrl);
  const action = data.slotId ? { label: 'Manage appointment', url: `${baseUrl}/appointments?appointmentId=${encodeURIComponent(data.slotId)}` } : undefined;
  return {
    subject: 'Upcoming Appointment Reminder | Happy Patient',
    ...brandedEmail({
      title: 'Your visit is coming up',
      message: 'A quick reminder about your upcoming appointment.',
      details,
      visit,
      status: 'Reminder',
      tone: 'info',
      action,
      steps: [
        { title: 'Arrive 10 minutes early', text: 'Bring your ID card so the front desk can find you by IIN.' },
        { title: 'Check in at the front desk', text: 'Check-in opens 30 minutes before your visit.' },
        { title: 'Plans changed?', text: 'Cancel or change the booking in Happy Patient so the time goes to another patient.' },
      ],
    }),
  };
}
