import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Workspace commands run from backend/, while local configuration lives at the repository root.
// Explicit process environment variables retain precedence (including Docker configuration).
loadEnv({ path: resolve(__dirname, '../../.env'), quiet: true });
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('1d'),
  RESET_TOKEN_EXPIRES_MINUTES: z.coerce.number().int().positive().default(30),
  RESEND_API_KEY: z.preprocess((value) => value || undefined, z.string().min(1).optional()),
  SLOT_RELEASE_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
  REMINDER_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
  REMINDER_LEAD_HOURS: z.string().default('24,2'),
  INTEGRITY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(86_400_000),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.preprocess((value) => value || undefined, z.string().url().optional())
});
export const config = envSchema.parse(process.env);
