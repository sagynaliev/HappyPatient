import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('1d'),
  RESET_TOKEN_EXPIRES_MINUTES: z.coerce.number().int().positive().default(30),
  RESEND_API_KEY: z.preprocess((value) => value || undefined, z.string().min(1).optional()),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.preprocess((value) => value || undefined, z.string().url().optional())
});
export const config = envSchema.parse(process.env);
