import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../src/config/configure-application';
import { validateEnvironment } from '../src/config/environment';
import { AuthModule } from '../src/modules/auth/auth.module';
import {
  AuthRepository,
  EmailAlreadyExistsRepositoryError,
  type AuthUserRecord,
} from '../src/modules/auth/repositories/auth.repository';
import { AuthSecurityModule } from '../src/modules/auth/security/auth-security.module';
import { PasswordHasher } from '../src/modules/auth/security/password-hasher';

const pooledUrl =
  'postgresql://neondb_owner:secret@ep-winter-math-azeayw91-pooler.c-3.ap-southeast-1.aws.neon.tech/Apartment?sslmode=require&channel_binding=require';
const environment = validateEnvironment({
  NODE_ENV: 'production',
  SWAGGER_ENABLED: 'true',
  CORS_ORIGINS: 'https://app.example.com',
  DATABASE_ENABLED: 'true',
  DATABASE_ENVIRONMENT: 'production',
  DATABASE_URL: pooledUrl,
  AUTH_ENABLED: 'true',
  // Business-flow regression suite; dedicated rate-limit API tests exercise low quotas.
  AUTH_RATE_LIMIT_LOGIN_IP_MAX: '1000',
  AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX: '1000',
  AUTH_JWT_ISSUER: 'rental-api-test',
  AUTH_JWT_AUDIENCE: 'rental-web-test',
  AUTH_JWT_ACTIVE_KID: 'test',
  AUTH_JWT_KEYS: JSON.stringify({ test: Buffer.alloc(32, 5).toString('base64') }),
  AUTH_REFRESH_COOKIE_NAME: '__Host-rental_refresh',
});

describe('Auth register/login API', () => {
  let app: INestApplication;
  let repository: jest.Mocked<AuthRepository>;
  let passwordHash: string;
  const user: AuthUserRecord = {
    id: 'a4c60e9e-5f9d-4a10-b7ab-c1d663c19f5c',
    email: 'user@example.com',
    passwordHash: '',
    displayName: 'User',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
  };

  beforeAll(async () => {
    repository = {
      createUserWithSession: jest.fn(),
      findUserByEmail: jest.fn(),
      findUserById: jest.fn(),
      findSessionFamilyByTokenHash: jest.fn().mockResolvedValue(null),
      createSessionForActiveUser: jest.fn(),
      rotateRefreshToken: jest.fn(),
      revokeFamilyByTokenHash: jest.fn(),
      revokeAllUserSessions: jest.fn(),
    } as unknown as jest.Mocked<AuthRepository>;
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [() => environment],
        }),
        AuthSecurityModule.register(environment),
        AuthModule.register(environment),
      ],
    })
      .overrideProvider(AuthRepository)
      .useValue(repository)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.init();
    passwordHash = await app.get(PasswordHasher).hash('correct horse battery staple');
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    repository.createUserWithSession.mockImplementation(async (input) => ({
      ...user,
      email: input.email,
      passwordHash: input.passwordHash,
    }));
    repository.findUserByEmail.mockResolvedValue({ ...user, passwordHash });
    repository.findUserById.mockResolvedValue({ ...user, passwordHash });
    repository.createSessionForActiveUser.mockResolvedValue();
    repository.revokeFamilyByTokenHash.mockResolvedValue();
    repository.revokeAllUserSessions.mockResolvedValue();
  });

  const authRequest = (path: 'register' | 'login') =>
    request(app.getHttpServer())
      .post(`/api/v1/auth/${path}`)
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1');

  it('registers and sets a production-safe HttpOnly refresh cookie without exposing it in JSON', async () => {
    const result = await authRequest('register')
      .send({
        email: ' USER@Example.COM ',
        password: 'correct horse battery staple',
        displayName: 'User',
      })
      .expect(201);
    expect(result.body).toMatchObject({ expiresIn: 600, user: { email: 'user@example.com' } });
    expect(result.body.refreshToken).toBeUndefined();
    expect(result.body.passwordHash).toBeUndefined();
    const cookie = result.headers['set-cookie']?.[0];
    expect(cookie).toContain('__Host-rental_refresh=');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Domain=');
  });

  it('rejects missing/untrusted Origin or missing CSRF header before invoking Auth', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: user.email, password: 'correct horse battery staple' })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('CSRF_VALIDATION_FAILED'));
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://untrusted.example')
      .set('X-CSRF-Protection', '1')
      .send({ email: user.email, password: 'correct horse battery staple' })
      .expect(403);
    expect(repository.createUserWithSession).not.toHaveBeenCalled();
  });

  it('maps duplicate email and unexpected database errors safely', async () => {
    repository.createUserWithSession.mockRejectedValueOnce(new EmailAlreadyExistsRepositoryError());
    await authRequest('register')
      .send({ email: user.email, password: 'correct horse battery staple' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EMAIL_ALREADY_EXISTS'));

    repository.createUserWithSession.mockRejectedValueOnce(new Error('private database detail'));
    const failure = await authRequest('register')
      .send({ email: user.email, password: 'correct horse battery staple' })
      .expect(500);
    expect(failure.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(failure.body)).not.toContain('private database detail');
  });

  it('returns identical invalid-credential errors for missing email and wrong password', async () => {
    repository.findUserByEmail.mockResolvedValueOnce(null);
    const missing = await authRequest('login')
      .send({ email: 'missing@example.com', password: 'wrong password value' })
      .expect(401);
    repository.findUserByEmail.mockResolvedValueOnce({ ...user, passwordHash });
    const wrong = await authRequest('login')
      .send({ email: user.email, password: 'wrong password value' })
      .expect(401);
    expect(missing.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(wrong.body).toMatchObject({
      code: missing.body.code,
      message: missing.body.message,
      statusCode: missing.body.statusCode,
    });
  });

  it('blocks disabled users and creates a session/cookie for a valid login', async () => {
    repository.findUserByEmail.mockResolvedValueOnce({
      ...user,
      passwordHash,
      status: 'DISABLED',
    });
    await authRequest('login')
      .send({ email: user.email, password: 'correct horse battery staple' })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('ACCOUNT_DISABLED'));

    repository.findUserByEmail.mockResolvedValueOnce({ ...user, passwordHash });
    const result = await authRequest('login')
      .send({ email: user.email, password: 'correct horse battery staple' })
      .expect(200);
    expect(result.body.accessToken).toEqual(expect.any(String));
    expect(result.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(repository.createSessionForActiveUser).toHaveBeenCalledTimes(1);
  });

  it('uses exact credentialed CORS and allows the fixed CSRF header', async () => {
    const result = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-protection')
      .expect(204);
    expect(result.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(result.headers['access-control-allow-credentials']).toBe('true');
    expect(result.headers['access-control-allow-headers']).toContain('X-CSRF-Protection');
  });

  it('rotates the refresh cookie and preserves the repository absolute expiry', async () => {
    const login = await authRequest('login')
      .send({ email: user.email, password: 'correct horse battery staple' })
      .expect(200);
    const oldCookie = login.headers['set-cookie']?.[0]?.split(';')[0];
    const absoluteExpiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    repository.rotateRefreshToken.mockResolvedValueOnce({
      outcome: 'ROTATED',
      user,
      familyId: '2d565a63-67d0-4df4-a244-1b1017f26353',
      expiresAt: absoluteExpiry,
    });
    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', oldCookie!)
      .send({})
      .expect(200);
    expect(refresh.body).toMatchObject({ expiresIn: 600, user: { id: user.id } });
    expect(refresh.headers['set-cookie']?.[0]).toContain('__Host-rental_refresh=');
    expect(refresh.headers['set-cookie']?.[0]?.split(';')[0]).not.toBe(oldCookie);
  });

  it.each([
    ['ALREADY_ROTATED', 409, 'TOKEN_ALREADY_ROTATED'],
    ['REUSE', 401, 'TOKEN_REUSE_DETECTED'],
    ['EXPIRED', 401, 'REFRESH_TOKEN_INVALID'],
    ['INVALID', 401, 'REFRESH_TOKEN_INVALID'],
    ['DISABLED', 403, 'ACCOUNT_DISABLED'],
  ] as const)('maps refresh outcome %s safely', async (outcome, status, code) => {
    repository.rotateRefreshToken.mockResolvedValueOnce({ outcome });
    const token = Buffer.alloc(32, 7).toString('base64url');
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', `__Host-rental_refresh=${token}`)
      .send({})
      .expect(status)
      .expect(({ body }) => expect(body.code).toBe(code));
    if (outcome === 'ALREADY_ROTATED') {
      expect(result.headers['set-cookie']).toBeUndefined();
    } else {
      expect(result.headers['set-cookie']?.[0]).toContain('Expires=Thu, 01 Jan 1970');
    }
  });

  it('logs out idempotently, revokes the current family and clears the cookie', async () => {
    const token = Buffer.alloc(32, 8).toString('base64url');
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', `__Host-rental_refresh=${token}`)
      .send({})
      .expect(204);
    expect(repository.revokeFamilyByTokenHash).toHaveBeenCalledTimes(1);
    expect(result.headers['set-cookie']?.[0]).toContain('__Host-rental_refresh=;');
    expect(result.headers['set-cookie']?.[0]).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('authenticates /me and logout-all from the JWT subject and checks current user status', async () => {
    const login = await authRequest('login')
      .send({ email: user.email, password: 'correct horse battery staple' })
      .expect(200);
    const accessToken = login.body.accessToken as string;
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: user.id, email: user.email, status: 'ACTIVE' });
        expect(body).not.toHaveProperty('passwordHash');
      });

    const logoutAll = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({})
      .expect(204);
    expect(repository.revokeAllUserSessions).toHaveBeenCalledWith(user.id, expect.any(Date));
    expect(logoutAll.headers['set-cookie']?.[0]).toContain('Expires=Thu, 01 Jan 1970');

    repository.findUserById.mockResolvedValueOnce({
      ...user,
      passwordHash,
      status: 'DISABLED',
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('ACCOUNT_DISABLED'));
  });

  it('rejects a missing or invalid bearer token for /me', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401)
      .expect(({ body }) => expect(body.code).toBe('UNAUTHORIZED'));
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid')
      .expect(401)
      .expect(({ body }) => expect(body.code).toBe('UNAUTHORIZED'));
  });
});
