import { z } from 'zod';
export const registrationSchema = z.object({
  email: z.string().trim().email().transform(v => v.toLowerCase()),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  iin: z.string().regex(/^\d{12}$/, 'IIN must contain exactly 12 digits.')
});
export const loginSchema = z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(1) });
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
export const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDate, 'Enter a valid calendar date.'),
  startTime: timeSchema,
  endTime: timeSchema,
}).superRefine(({ startTime, endTime }, context) => {
  if (startTime >= endTime) context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be later than start time.' });
});
export const scheduleDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDate, 'Enter a valid calendar date.');
export const bookingSchema = z.object({ visitPurpose: z.string().trim().min(1).max(300) });
export const slotUpdateSchema = z.object({
  status: z.enum(['FREE', 'BOOKED', 'OCCUPIED']),
  patientId: z.string().min(1).optional(),
  visitPurpose: z.string().trim().min(1).max(300).optional(),
}).superRefine((slot, context) => {
  if (slot.status === 'BOOKED' && (!slot.patientId || !slot.visitPurpose)) {
    context.addIssue({ code: 'custom', path: ['patientId'], message: 'A booked slot requires a patient and visit purpose.' });
  }
  if (slot.status !== 'BOOKED' && (slot.patientId || slot.visitPurpose)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Patient details can only be set for booked slots.' });
  }
});
