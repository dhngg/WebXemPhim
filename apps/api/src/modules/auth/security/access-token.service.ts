import { randomUUID } from 'node:crypto';
import jwt, { type JwtHeader, type JwtPayload } from 'jsonwebtoken';
import type { AuthSecurityConfig } from '../../../config/auth-security.config';

const ACCESS_TOKEN_TYPE = 'access';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYLOAD_CLAIMS = new Set(['sub', 'sid', 'jti', 'iss', 'aud', 'iat', 'exp', 'typ']);

export interface AccessTokenClaims {
  readonly sub: string;
  readonly sid: string;
  readonly jti: string;
  readonly iss: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly typ: typeof ACCESS_TOKEN_TYPE;
}

export class InvalidAccessTokenError extends Error {
  constructor() {
    super('Invalid access token');
    this.name = 'InvalidAccessTokenError';
  }
}

export class AccessTokenExpiredError extends InvalidAccessTokenError {
  constructor() {
    super();
    this.name = 'AccessTokenExpiredError';
  }
}

export class AccessTokenService {
  constructor(private readonly config: AuthSecurityConfig) {}

  issue(userId: string, sessionFamilyId: string): string {
    assertUuid(userId);
    assertUuid(sessionFamilyId);
    const key = this.config.keys.get(this.config.activeKid);
    if (!key) throw new Error('Active JWT signing key is unavailable');
    return jwt.sign({ sid: sessionFamilyId, typ: ACCESS_TOKEN_TYPE }, key, {
      algorithm: 'HS256',
      keyid: this.config.activeKid,
      issuer: this.config.issuer,
      audience: this.config.audience,
      subject: userId,
      jwtid: randomUUID(),
      expiresIn: this.config.accessTokenTtlSeconds,
    });
  }

  verify(token: string, clockTimestamp?: number): AccessTokenClaims {
    try {
      const decodedHeader = jwt.decode(token, { complete: true });
      if (!decodedHeader || !isAllowedHeader(decodedHeader.header))
        throw new InvalidAccessTokenError();
      const key = this.config.keys.get(decodedHeader.header.kid);
      if (!key) throw new InvalidAccessTokenError();

      const verified = jwt.verify(token, key, {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        complete: true,
        clockTolerance: 0,
        ...(clockTimestamp === undefined ? {} : { clockTimestamp }),
      });
      return validateClaims(verified.payload, this.config, clockTimestamp);
    } catch (error) {
      if (error instanceof AccessTokenExpiredError) throw error;
      if (error instanceof jwt.TokenExpiredError) throw new AccessTokenExpiredError();
      throw new InvalidAccessTokenError();
    }
  }
}

function isAllowedHeader(header: JwtHeader): header is JwtHeader & { kid: string } {
  return (
    header.alg === 'HS256' &&
    header.typ === 'JWT' &&
    typeof header.kid === 'string' &&
    Object.keys(header).every((claim) => ['alg', 'typ', 'kid'].includes(claim))
  );
}

function validateClaims(
  payload: string | JwtPayload,
  config: AuthSecurityConfig,
  clockTimestamp?: number,
): AccessTokenClaims {
  if (
    typeof payload === 'string' ||
    !Object.keys(payload).every((claim) => PAYLOAD_CLAIMS.has(claim))
  ) {
    throw new InvalidAccessTokenError();
  }
  const { sub, sid, jti, iss, aud, iat, exp, typ } = payload;
  if (
    typeof sub !== 'string' ||
    typeof sid !== 'string' ||
    typeof jti !== 'string' ||
    typeof iss !== 'string' ||
    typeof aud !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number' ||
    typ !== ACCESS_TOKEN_TYPE ||
    iss !== config.issuer ||
    aud !== config.audience ||
    !UUID_PATTERN.test(sub) ||
    !UUID_PATTERN.test(sid) ||
    !UUID_PATTERN.test(jti) ||
    exp - iat !== config.accessTokenTtlSeconds
  ) {
    throw new InvalidAccessTokenError();
  }
  const now = clockTimestamp ?? Math.floor(Date.now() / 1000);
  if (iat > now || exp <= now) throw new InvalidAccessTokenError();
  return { sub, sid, jti, iss, aud, iat, exp, typ };
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error('Access token identifiers must be UUIDs');
}
