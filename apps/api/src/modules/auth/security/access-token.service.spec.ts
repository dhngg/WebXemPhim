import jwt from 'jsonwebtoken';
import { createAuthSecurityConfig } from '../../../config/auth-security.config';
import {
  AccessTokenExpiredError,
  AccessTokenService,
  InvalidAccessTokenError,
} from './access-token.service';

const userId = 'a4c60e9e-5f9d-4a10-b7ab-c1d663c19f5c';
const familyId = '2d565a63-67d0-4df4-a244-1b1017f26353';
const currentKey = Buffer.alloc(32, 3);
const previousKey = Buffer.alloc(32, 4);

function config(activeKid = 'current', includePrevious = true) {
  return createAuthSecurityConfig({
    issuer: 'rental-api-test',
    audience: 'rental-web-test',
    activeKid,
    encodedKeys: JSON.stringify({
      current: currentKey.toString('base64'),
      ...(includePrevious ? { previous: previousKey.toString('base64') } : {}),
    }),
    argon2MemoryKiB: 19_456,
    argon2TimeCost: 2,
    argon2Parallelism: 1,
  });
}

describe('AccessTokenService', () => {
  it('issues HS256 access tokens with strict approved claims and a 10-minute TTL', () => {
    const service = new AccessTokenService(config());
    const token = service.issue(userId, familyId);
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header).toMatchObject({ alg: 'HS256', typ: 'JWT', kid: 'current' });
    const claims = service.verify(token);
    expect(claims).toMatchObject({
      sub: userId,
      sid: familyId,
      iss: 'rental-api-test',
      aud: 'rental-web-test',
      typ: 'access',
    });
    expect(claims.exp - claims.iat).toBe(600);
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('supports controlled kid rotation and rejects removed or unknown keys', () => {
    const previousSigner = new AccessTokenService(config('previous'));
    const oldToken = previousSigner.issue(userId, familyId);
    expect(new AccessTokenService(config('current')).verify(oldToken).sub).toBe(userId);
    expect(() => new AccessTokenService(config('current', false)).verify(oldToken)).toThrow(
      InvalidAccessTokenError,
    );
  });

  it('rejects wrong algorithm, issuer, audience, type, extra claims and invalid signature', () => {
    const service = new AccessTokenService(config());
    const base = { sid: familyId, typ: 'access' };
    const options = {
      keyid: 'current',
      issuer: 'rental-api-test',
      audience: 'rental-web-test',
      subject: userId,
      jwtid: '96e5ae40-c606-4ccc-82fc-c3247999339f',
      expiresIn: 600,
    } as const;
    const tokens = [
      jwt.sign(base, currentKey, { ...options, algorithm: 'HS384' }),
      jwt.sign(base, currentKey, { ...options, algorithm: 'HS256', issuer: 'wrong-issuer' }),
      jwt.sign(base, currentKey, { ...options, algorithm: 'HS256', audience: 'wrong-audience' }),
      jwt.sign({ ...base, typ: 'refresh' }, currentKey, { ...options, algorithm: 'HS256' }),
      jwt.sign({ ...base, role: 'owner' }, currentKey, { ...options, algorithm: 'HS256' }),
      new AccessTokenService(config()).issue(userId, familyId).slice(0, -1) + 'x',
    ];
    for (const token of tokens)
      expect(() => service.verify(token)).toThrow(InvalidAccessTokenError);
  });

  it('distinguishes expiry without accepting an expired token', () => {
    const service = new AccessTokenService(config());
    const token = service.issue(userId, familyId);
    const payload = jwt.decode(token) as jwt.JwtPayload;
    expect(() => service.verify(token, payload.exp)).toThrow(AccessTokenExpiredError);
  });

  it('rejects invalid identifiers before signing', () => {
    expect(() => new AccessTokenService(config()).issue('not-a-uuid', familyId)).toThrow('UUIDs');
  });
});
