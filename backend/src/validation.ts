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
