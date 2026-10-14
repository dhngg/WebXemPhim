import { timingSafeEqual } from 'node:crypto';

export const ACCESS_TOKEN_TTL_SECONDS = 600 as const;
export const REFRESH_TOKEN_BYTES = 32 as const;
export const REFRESH_FAMILY_TTL_DAYS = 30 as const;
export const REFRESH_ROTATION_GRACE_SECONDS = 10 as const;

export interface AuthSecurityConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly activeKid: string;
  readonly keys: ReadonlyMap<string, Buffer>;
  readonly accessTokenTtlSeconds: typeof ACCESS_TOKEN_TTL_SECONDS;
  readonly argon2: {
    readonly memoryCost: number;
    readonly timeCost: number;
    readonly parallelism: number;
  };
}

interface AuthSecurityConfigInput {
  issuer?: string;
  audience?: string;
  activeKid?: string;
  encodedKeys?: string;
  argon2MemoryKiB: number;
  argon2TimeCost: number;
  argon2Parallelism: number;
}

export function createAuthSecurityConfig(input: AuthSecurityConfigInput): AuthSecurityConfig {
  const issuer = requiredSetting(input.issuer, 'AUTH_JWT_ISSUER');
  const audience = requiredSetting(input.audience, 'AUTH_JWT_AUDIENCE');
  const activeKid = requiredSetting(input.activeKid, 'AUTH_JWT_ACTIVE_KID');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(activeKid)) {
    throw new Error('AUTH_JWT_ACTIVE_KID must use 1-64 safe identifier characters');
  }

  const keys = parseKeyRing(requiredSetting(input.encodedKeys, 'AUTH_JWT_KEYS'));
  if (!keys.has(activeKid)) {
    throw new Error('AUTH_JWT_ACTIVE_KID must identify a key in AUTH_JWT_KEYS');
  }

  return Object.freeze({
    issuer,
    audience,
    activeKid,
    keys,
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    argon2: Object.freeze({
      memoryCost: input.argon2MemoryKiB,
      timeCost: input.argon2TimeCost,
      parallelism: input.argon2Parallelism,
    }),
  });
}

function requiredSetting(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required when AUTH_ENABLED=true`);
  if (normalized.length > 200) throw new Error(`${name} is too long`);
  return normalized;
}

function parseKeyRing(encoded: string): ReadonlyMap<string, Buffer> {
  let raw: unknown;
  try {
    raw = JSON.parse(encoded);
  } catch {
    throw new Error('AUTH_JWT_KEYS must be a JSON object of base64-encoded keys');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('AUTH_JWT_KEYS must be a JSON object of base64-encoded keys');
  }

  const entries = Object.entries(raw);
  if (entries.length === 0) throw new Error('AUTH_JWT_KEYS must contain at least one key');
  const keys = new Map<string, Buffer>();
  for (const [kid, value] of entries) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid) || typeof value !== 'string') {
      throw new Error('AUTH_JWT_KEYS contains an invalid key identifier or value');
    }
    const key = decodeSecret(value);
    if (key.length < 32) {
      throw new Error('Every AUTH_JWT_KEYS secret must contain at least 256 bits');
    }
    if ([...keys.values()].some((existing) => sameBytes(existing, key))) {
      throw new Error('AUTH_JWT_KEYS must not reuse secret material under different identifiers');
    }
    keys.set(kid, key);
  }
  return keys;
}

function decodeSecret(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Every AUTH_JWT_KEYS secret must be valid canonical base64');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error('Every AUTH_JWT_KEYS secret must be valid canonical base64');
  }
  return decoded;
}

function sameBytes(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}
