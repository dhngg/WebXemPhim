import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { config } from 'dotenv';
import { z } from 'zod';
import { createAuthSecurityConfig, type AuthSecurityConfig } from './auth-security.config';

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
  AUTH_ENABLED: booleanSetting('false'),
  TRUSTED_PROXY_CIDRS: z
    .string()
    .default('')
    .transform((value, context) => {
      if (!value.trim()) return [];
      const entries = value.split(',').map((entry) => entry.trim());
      if (
        entries.some((entry) => {
          const [address, prefix, extra] = entry.split('/');
          const version = isIP(address ?? '');
          return (
            !version ||
            extra !== undefined ||
            (prefix !== undefined &&
              (!/^\d+$/.test(prefix) ||
                Number(prefix) < 1 ||
                Number(prefix) > (version === 4 ? 32 : 128)))
          );
        })
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Expected explicit proxy IPs/CIDRs',
        });
        return z.NEVER;
      }
      return entries;
    }),
  AUTH_RATE_LIMIT_REGISTER_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  AUTH_RATE_LIMIT_REGISTER_IP_MAX: z.coerce.number().int().min(1).max(100000).default(5),
  AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  AUTH_RATE_LIMIT_LOGIN_IP_MAX: z.coerce.number().int().min(1).max(100000).default(30),
  AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX: z.coerce.number().int().min(1).max(100000).default(10),
  AUTH_RATE_LIMIT_REFRESH_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(60),
  AUTH_RATE_LIMIT_REFRESH_IP_MAX: z.coerce.number().int().min(1).max(100000).default(60),
  AUTH_RATE_LIMIT_REFRESH_FAMILY_MAX: z.coerce.number().int().min(1).max(100000).default(30),
  AUTH_RATE_LIMIT_FORGOT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  AUTH_RATE_LIMIT_FORGOT_IP_MAX: z.coerce.number().int().min(1).max(100000).default(5),
  AUTH_RATE_LIMIT_FORGOT_EMAIL_MAX: z.coerce.number().int().min(1).max(100000).default(3),
  AUTH_RATE_LIMIT_RESET_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  AUTH_RATE_LIMIT_RESET_IP_MAX: z.coerce.number().int().min(1).max(100000).default(10),
  AUTH_RATE_LIMIT_RESET_TOKEN_MAX: z.coerce.number().int().min(1).max(100000).default(5),
  AUTH_RATE_LIMIT_MAX_KEYS: z.coerce.number().int().min(1).max(1000000).default(20000),
  EMAIL_PROVIDER: z.enum(['disabled', 'smtp']).default('disabled'),
  EMAIL_FROM: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(65535).optional(),
  ),
  SMTP_SECURE: booleanSetting('false'),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  PASSWORD_RESET_URL_BASE: optionalString,
  AUTH_JWT_ISSUER: optionalString,
  AUTH_JWT_AUDIENCE: optionalString,
  AUTH_JWT_ACTIVE_KID: optionalString,
  AUTH_JWT_KEYS: optionalString,
  AUTH_REFRESH_COOKIE_NAME: optionalString,
  AUTH_ARGON2_MEMORY_KIB: z.coerce.number().int().min(19_456).default(19_456),
  AUTH_ARGON2_TIME_COST: z.coerce.number().int().min(2).default(2),
  AUTH_ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(4).default(1),
});

export type Environment = Omit<
  z.infer<typeof environmentSchema>,
  | 'SWAGGER_ENABLED'
  | 'CORS_ORIGINS'
  | 'AUTH_JWT_ISSUER'
  | 'AUTH_JWT_AUDIENCE'
  | 'AUTH_JWT_ACTIVE_KID'
  | 'AUTH_JWT_KEYS'
> & {
  SWAGGER_ENABLED: boolean;
  CORS_ORIGINS: string[];
  AUTH_SECURITY?: AuthSecurityConfig;
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
  const hasAuthConfiguration = Boolean(
    values.AUTH_JWT_ISSUER ||
    values.AUTH_JWT_AUDIENCE ||
    values.AUTH_JWT_ACTIVE_KID ||
    values.AUTH_JWT_KEYS ||
    values.AUTH_REFRESH_COOKIE_NAME,
  );
  if (!values.AUTH_ENABLED && hasAuthConfiguration) {
    throw new Error('AUTH_ENABLED must be true when Auth signing configuration is present');
  }
  if (values.NODE_ENV === 'production' && !values.AUTH_ENABLED) {
    throw new Error('AUTH_ENABLED must be true in production');
  }
  if (values.AUTH_ENABLED && !values.DATABASE_ENABLED) {
    throw new Error('DATABASE_ENABLED must be true when AUTH_ENABLED=true');
  }
  if (
    values.NODE_ENV === 'production' &&
    values.AUTH_ENABLED &&
    origins.some((origin) => !origin.startsWith('https://'))
  ) {
    throw new Error('CORS_ORIGINS must use HTTPS when Auth is enabled in production');
  }
  if (values.EMAIL_PROVIDER === 'smtp') {
    if (!values.AUTH_ENABLED) throw new Error('AUTH_ENABLED must be true when EMAIL_PROVIDER=smtp');
    if (
      !values.SMTP_HOST ||
      !values.SMTP_PORT ||
      !values.EMAIL_FROM ||
      !values.PASSWORD_RESET_URL_BASE
    ) {
      throw new Error(
        'EMAIL_PROVIDER=smtp requires SMTP_HOST, SMTP_PORT, EMAIL_FROM and PASSWORD_RESET_URL_BASE',
      );
    }
    if (Boolean(values.SMTP_USER) !== Boolean(values.SMTP_PASSWORD)) {
      throw new Error('SMTP_USER and SMTP_PASSWORD must be set together');
    }
    let resetUrl: URL;
    try {
      resetUrl = new URL(values.PASSWORD_RESET_URL_BASE);
    } catch {
      throw new Error('PASSWORD_RESET_URL_BASE must be a valid URL');
    }
    if (
      !['http:', 'https:'].includes(resetUrl.protocol) ||
      resetUrl.search ||
      resetUrl.hash ||
      resetUrl.username ||
      resetUrl.password
    ) {
      throw new Error(
        'PASSWORD_RESET_URL_BASE must be an http(s) URL without query, fragment or credentials',
      );
    }
    if (!origins.includes(resetUrl.origin)) {
      throw new Error('PASSWORD_RESET_URL_BASE origin must be listed in CORS_ORIGINS');
    }
    if (values.NODE_ENV === 'production' && resetUrl.protocol !== 'https:') {
      throw new Error('PASSWORD_RESET_URL_BASE must use HTTPS in production');
    }
  }
  if (values.AUTH_ENABLED) {
    const cookieName = values.AUTH_REFRESH_COOKIE_NAME?.trim();
    if (!cookieName || !/^[A-Za-z0-9_-]{1,100}$/.test(cookieName)) {
      throw new Error('AUTH_REFRESH_COOKIE_NAME is required and must be a safe cookie name');
    }
    if (values.NODE_ENV === 'production' && !cookieName.startsWith('__Host-')) {
      throw new Error('AUTH_REFRESH_COOKIE_NAME must use the __Host- prefix in production');
    }
  }
  const authSecurity = values.AUTH_ENABLED
    ? createAuthSecurityConfig({
        issuer: values.AUTH_JWT_ISSUER,
        audience: values.AUTH_JWT_AUDIENCE,
        activeKid: values.AUTH_JWT_ACTIVE_KID,
        encodedKeys: values.AUTH_JWT_KEYS,
        argon2MemoryKiB: values.AUTH_ARGON2_MEMORY_KIB,
        argon2TimeCost: values.AUTH_ARGON2_TIME_COST,
        argon2Parallelism: values.AUTH_ARGON2_PARALLELISM,
      })
    : undefined;
  const {
    AUTH_JWT_ISSUER: _authIssuer,
    AUTH_JWT_AUDIENCE: _authAudience,
    AUTH_JWT_ACTIVE_KID: _authActiveKid,
    AUTH_JWT_KEYS: _authKeys,
    ...runtimeValues
  } = values;
  void _authIssuer;
  void _authAudience;
  void _authActiveKid;
  void _authKeys;

  return {
    ...runtimeValues,
    CORS_ORIGINS: origins,
    SWAGGER_ENABLED:
      values.SWAGGER_ENABLED === undefined
        ? values.NODE_ENV !== 'production'
        : values.SWAGGER_ENABLED === 'true',
    ...(authSecurity ? { AUTH_SECURITY: authSecurity } : {}),
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
