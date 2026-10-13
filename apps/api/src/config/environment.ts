import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

export const envFiles = [resolve(__dirname, '../../.env'), resolve(__dirname, '../../../../.env')];

export const NEON_DATABASE_NAME = 'Apartment';
export const NEON_DATABASE_USER = 'neondb_owner';
export const NEON_POOLED_HOST = 'ep-winter-math-azeayw91-pooler.c-3.ap-southeast-1.aws.neon.tech';
export const NEON_DIRECT_HOST = 'ep-winter-math-azeayw91.c-3.ap-southeast-1.aws.neon.tech';

const booleanSetting = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  DATABASE_ENABLED: booleanSetting('false'),
  DATABASE_ENVIRONMENT: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: optionalString,
  DIRECT_URL: optionalString,
});

export type Environment = Omit<
  z.infer<typeof environmentSchema>,
  'SWAGGER_ENABLED' | 'CORS_ORIGINS'
> & {
  SWAGGER_ENABLED: boolean;
  CORS_ORIGINS: string[];
};

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }

  const values = parsed.data;
  const origins = values.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => !isValidOrigin(origin))) {
    throw new Error(
      'CORS_ORIGINS must contain explicit HTTP(S) origins without paths or wildcards',
    );
  }
  if (values.DATABASE_ENABLED && !values.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when DATABASE_ENABLED=true');
  }
  const hasDatabaseConfiguration =
    values.DATABASE_ENABLED || Boolean(values.DATABASE_URL) || Boolean(values.DIRECT_URL);
  if (
    hasDatabaseConfiguration &&
    values.NODE_ENV === 'production' &&
    values.DATABASE_ENVIRONMENT !== 'production'
  ) {
    throw new Error('DATABASE_ENVIRONMENT must be production when NODE_ENV=production');
  }
  if (
    hasDatabaseConfiguration &&
    values.NODE_ENV !== 'production' &&
    values.DATABASE_ENVIRONMENT === 'production'
  ) {
    throw new Error('A non-production process cannot use DATABASE_ENVIRONMENT=production');
  }
  if (values.DATABASE_URL) validateNeonUrl(values.DATABASE_URL, 'pooled');
  if (values.DIRECT_URL) validateNeonUrl(values.DIRECT_URL, 'direct');

  return {
    ...values,
    CORS_ORIGINS: origins,
    SWAGGER_ENABLED:
      values.SWAGGER_ENABLED === undefined
        ? values.NODE_ENV !== 'production'
        : values.SWAGGER_ENABLED === 'true',
  };
}

function validateNeonUrl(value: string, kind: 'pooled' | 'direct'): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${kind === 'pooled' ? 'DATABASE_URL' : 'DIRECT_URL'} is invalid`);
  }

  const variable = kind === 'pooled' ? 'DATABASE_URL' : 'DIRECT_URL';
  const expectedHost = kind === 'pooled' ? NEON_POOLED_HOST : NEON_DIRECT_HOST;
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${variable} must use the PostgreSQL protocol`);
  }
  if (url.hostname !== expectedHost) {
    throw new Error(`${variable} must use the approved ${kind} Neon host`);
  }
  if (decodeURIComponent(url.username) !== NEON_DATABASE_USER) {
    throw new Error(`${variable} must use the approved Neon database user`);
  }
  if (decodeURIComponent(url.pathname.slice(1)) !== NEON_DATABASE_NAME) {
    throw new Error(`${variable} must target the Apartment database`);
  }
  if (url.searchParams.get('sslmode') !== 'require') {
    throw new Error(`${variable} must include sslmode=require`);
  }
  if (url.searchParams.get('channel_binding') !== 'require') {
    throw new Error(`${variable} must include channel_binding=require`);
  }
}

function isValidOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === origin;
  } catch {
    return false;
  }
}

export function loadEnvironment(): Environment {
  config({ path: envFiles, quiet: true });
  return validateEnvironment(process.env);
}
