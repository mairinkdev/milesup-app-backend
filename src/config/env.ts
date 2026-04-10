import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => {
      const trimmed = value.trim().replace(/\/+$/, '');
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      return `https://${trimmed}`;
    })
    .pipe(z.string().url()),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().default('*'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  VERIFICATION_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  CHECKOUT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  PASSWORD_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),
  EXPOSE_DEV_CODES: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() === 'true'),
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined)
    .refine((val) => !val || val.startsWith('re_'), {
      message: 'RESEND_API_KEY must start with "re_". Please check your configuration.'
    }),
  MAIL_FROM: z.string().email().default('noreply@resend.dev'),
  MAIL_FROM_NAME: z.string().default('MilesUp'),
  MAIL_REPLY_TO: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined)
    .pipe(z.string().email().optional()),
  DEV_NOTIFICATION_EMAIL: z.string().email().default('dev-inbox@milesup.local')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = {
  ...parsed.data,
  corsOrigins:
    parsed.data.CORS_ORIGIN === '*'
      ? ['*']
      : parsed.data.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
};
