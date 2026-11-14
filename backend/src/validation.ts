import { z } from 'zod';
/** Kazakhstan IIN: YYMMDD birth date, century/sex digit, serial and a mod-11 check digit. */
export function isValidIin(value: string) {
  if (!/^\d{12}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) return false;
  const weighted = (weights: number[]) => weights.reduce((sum, weight, index) => sum + weight * digits[index], 0) % 11;
  let check = weighted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  if (check === 10) check = weighted([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]);
  return check !== 10 && check === digits[11];
}
const iinSchema = z.string().regex(/^\d{12}$/, 'IIN must contain exactly 12 digits.').refine(isValidIin, 'Enter a valid IIN.');
const phoneSchema = z.string().trim().regex(/^\+?[\d\s()-]{7,30}$/, 'Enter a valid phone number.').refine(value => value.replace(/\D/g, '').length >= 10, 'Enter a valid phone number.');
export const registrationSchema = z.object({
  email: z.string().trim().email().transform(v => v.toLowerCase()),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: phoneSchema,
  iin: iinSchema
});
export const loginSchema = z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(1) });
export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).transform(value => value || null).nullable(),
});
export const recoverySchema = z.object({ email: z.string().email().transform(v => v.toLowerCase()) });
export const verificationCodeSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code.')
});
export const resetSchema = z.object({ token: z.string().min(20), password: z.string().min(8).max(128) });

const isValidDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/, 'Times must use 24-hour time in 30-minute increments.');
export const officeSchema = z.object({ office: z.string().trim().min(1).max(200) });
const optionalLocationText = (maximumLength: number) =>
  z.string().trim().max(maximumLength).transform(value => value || null).nullable();
export const doctorLocationSchema = z.object({
  city: optionalLocationText(100),
  clinicName: optionalLocationText(150),
  streetAddress: optionalLocationText(200),
  officeNumber: optionalLocationText(50),
  /** An office from the clinic's reference list; when given it sets the office and city. */
  locationId: z.string().min(1).max(64).nullable().optional(),
});
export const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDate, 'Enter a valid calendar date.'),
  startTime: timeSchema,
  endTime: timeSchema,
}).superRefine(({ startTime, endTime }, context) => {
  if (startTime >= endTime) context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be later than start time.' });
});
export const scheduleDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDate, 'Enter a valid calendar date.');
export const scheduleBatchSchema = z.object({
  dates: z.array(scheduleDateSchema).min(1).max(7),
  startTime: timeSchema,
  endTime: timeSchema,
}).superRefine(({ dates, startTime, endTime }, context) => {
  if (new Set(dates).size !== dates.length) {
    context.addIssue({ code: 'custom', path: ['dates'], message: 'Working dates must be unique.' });
  }
  if (startTime >= endTime) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be later than start time.' });
  }
});
export const bookingSchema = z.object({ visitPurpose: z.string().trim().min(1).max(300), channel: z.enum(['in-person', 'online']).default('in-person') });
export const cancellationReasonSchema = z.string().trim().min(3, 'Please tell us why the appointment is being cancelled.').max(300);
export const cancelSchema = z.object({ reason: cancellationReasonSchema });
export const walkInLookupSchema = z.object({ iin: z.string().regex(/^\d{12}$/, 'IIN must contain exactly 12 digits.') });
export const walkInRegistrationSchema = z.object({
  email: z.string().trim().email().transform(v => v.toLowerCase()).optional().or(z.literal('')),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: phoneSchema.optional().or(z.literal('')),
  // Checksum is enforced when a new patient is created, so existing records stay reusable.
  iin: z.string().regex(/^\d{12}$/, 'IIN must contain exactly 12 digits.'),
  doctorId: z.string().min(1),
  slotId: z.string().min(1),
  visitPurpose: z.string().trim().min(1).max(300),
});
export const slotUpdateSchema = z.object({
  status: z.enum(['FREE', 'BOOKED', 'OCCUPIED']),
  patientId: z.string().min(1).optional(),
  visitPurpose: z.string().trim().min(1).max(300).optional(),
  releaseBooking: z.boolean().optional(),
  cancellationReason: cancellationReasonSchema.optional(),
}).superRefine((slot, context) => {
  if (slot.releaseBooking && !slot.cancellationReason) {
    context.addIssue({ code: 'custom', path: ['cancellationReason'], message: 'Please give the patient a reason for cancelling.' });
  }
  if (slot.status === 'BOOKED' && (!slot.patientId || !slot.visitPurpose)) {
    context.addIssue({ code: 'custom', path: ['patientId'], message: 'A booked slot requires a patient and visit purpose.' });
  }
  if (slot.status !== 'BOOKED' && (slot.patientId || slot.visitPurpose)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Patient details can only be set for booked slots.' });
  }
  if (slot.releaseBooking && slot.status !== 'FREE') {
    context.addIssue({ code: 'custom', path: ['releaseBooking'], message: 'A released appointment must become available.' });
  }
});
