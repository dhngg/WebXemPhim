import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApplicationException } from '../src/common/errors/application-exception';
import { configureApplication } from '../src/config/configure-application';
import { validateEnvironment } from '../src/config/environment';
import { AuthModule } from '../src/modules/auth/auth.module';
import { AuthRepository } from '../src/modules/auth/repositories/auth.repository';
import { AuthSecurityModule } from '../src/modules/auth/security/auth-security.module';
import { PasswordResetRepository } from '../src/modules/auth/password-reset/password-reset.repository';
import { AUTH_SERVICE } from '../src/modules/auth/services/auth-service.contract';
import { DUMMY_PASSWORD_HASH } from '../src/modules/auth/services/auth.service';

describe('Auth rate limits through HTTP, Express proxy resolution and error filter', () => {
  let app: INestApplication;
  const auth = {
    register: jest.fn(async () => {
      throw new ApplicationException('EMAIL_ALREADY_EXISTS');
    }),
    login: jest.fn(async () => {
      throw new ApplicationException('INVALID_CREDENTIALS');
    }),
    refresh: jest.fn(async () => {
      throw new ApplicationException('REFRESH_TOKEN_INVALID');
    }),
    logout: jest.fn(async () => undefined),
  };
  const familyLookup = jest.fn();

  async function start(overrides: Record<string, unknown> = {}): Promise<void> {
    const environment = validateEnvironment({
      NODE_ENV: 'test',
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: 'https://app.example.com',
      DATABASE_ENABLED: 'true',
      // Synthetic URL required by configuration only; the repository is overridden, never connected.
      DATABASE_URL:
        'postgresql://neondb_owner:placeholder@ep-winter-math-azeayw91-pooler.c-3.ap-southeast-1.aws.neon.tech/Apartment?sslmode=require&channel_binding=require',
      AUTH_ENABLED: 'true',
      AUTH_JWT_ISSUER: 'test-api',
      AUTH_JWT_AUDIENCE: 'test-web',
      AUTH_JWT_ACTIVE_KID: 'test',
      AUTH_JWT_KEYS: JSON.stringify({ test: Buffer.alloc(32, 5).toString('base64') }),
      AUTH_REFRESH_COOKIE_NAME: 'test_refresh',
      AUTH_RATE_LIMIT_REGISTER_IP_MAX: 2,
      AUTH_RATE_LIMIT_LOGIN_IP_MAX: 3,
      AUTH_RATE_LIMIT_LOGIN_EMAIL_MAX: 2,
      AUTH_RATE_LIMIT_REFRESH_IP_MAX: 3,
      AUTH_RATE_LIMIT_REFRESH_FAMILY_MAX: 2,
      AUTH_RATE_LIMIT_REGISTER_WINDOW_SECONDS: 10,
      AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS: 10,
      AUTH_RATE_LIMIT_REFRESH_WINDOW_SECONDS: 10,
      ...overrides,
    });
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
      .useValue({ findSessionFamilyByTokenHash: familyLookup })
      .overrideProvider(PasswordResetRepository)
      .useValue({})
      .overrideProvider(DUMMY_PASSWORD_HASH)
      .useValue('unused-test-hash')
      .overrideProvider(AUTH_SERVICE)
      .useValue(auth)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.init();
  }

  beforeEach(() => {
    familyLookup.mockReset().mockResolvedValue(null);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (app) await app.close();
  });

  const post = (route: string, ip = '192.0.2.1') =>
    request(app.getHttpServer())
      .post(`/api/v1/auth/${route}`)
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .set('X-Forwarded-For', ip);
  const login = (email: string, ip?: string) =>
    post('login', ip).send({ email, password: 'test password phrase' });

  it('limits register per socket IP despite spoofed forwarding headers and returns safe 429/Retry-After', async () => {
    await start();
    for (let i = 0; i < 2; i++) {
      await post('register', `192.0.2.${i + 1}`)
        .set('X-Real-IP', `198.51.100.${i + 1}`)
        .send({ email: `user${i}@example.com`, password: 'test password phrase' })
        .expect(409);
    }
    const result = await post('register', '203.0.113.1')
      .send({ email: 'another@example.com', password: 'test password phrase' })
      .expect(429);
    expect(result.body).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      path: '/api/v1/auth/register',
    });
    expect(Number(result.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(result.headers['retry-after'])).toBeLessThanOrEqual(10);
    expect(result.headers['access-control-expose-headers']).toContain('Retry-After');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toMatch(/another@example|test password/);
    expect(auth.register).toHaveBeenCalledTimes(2);
  });

  it('shares the normalized email quota across IPs without querying account existence', async () => {
    await start({ TRUSTED_PROXY_CIDRS: '127.0.0.1,::1' });
    await login(' USER@Example.com ', '192.0.2.1').expect(401);
    await login('user@example.com', '192.0.2.2').expect(401);
    await login('User@example.COM', '192.0.2.3').expect(429);
    await login('other@example.com', '192.0.2.3').expect(401);
    expect(auth.login).toHaveBeenCalledTimes(3);
    expect(familyLookup).not.toHaveBeenCalled();
  });

  it('limits IP independently of email changes and keeps different trusted client IPs separate', async () => {
    await start({ TRUSTED_PROXY_CIDRS: '127.0.0.1,::1' });
    for (let i = 0; i < 3; i++) await login(`user${i}@example.com`).expect(401);
    await login('user4@example.com').expect(429);
    await login('user4@example.com', '192.0.2.2').expect(401);
  });

  it('stops at the nearest untrusted hop instead of trusting a spoofed leftmost XFF', async () => {
    await start({ TRUSTED_PROXY_CIDRS: '127.0.0.1,::1' });
    for (let i = 0; i < 3; i++)
      await login(`user${i}@example.com`, `203.0.113.${i + 1}, 192.0.2.10`).expect(401);
    await login('next@example.com', '203.0.113.99, 192.0.2.10').expect(429);
  });

  it('ignores XFF when the socket peer is outside the configured trusted subnet', async () => {
    await start({ TRUSTED_PROXY_CIDRS: '10.20.0.0/24' });
    for (let i = 0; i < 3; i++) await login(`user${i}@example.com`, `192.0.2.${i + 1}`).expect(401);
    await login('next@example.com', '192.0.2.99').expect(429);
  });

  it('resets the window and does not slide it forward on denied requests', async () => {
    await start();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    await login('user@example.com').expect(401);
    await login('user@example.com').expect(401);
    clock.mockReturnValue(109_100);
    const blocked = await login('user@example.com').expect(429);
    expect(blocked.headers['retry-after']).toBe('1');
    clock.mockReturnValue(110_000);
    await login('user@example.com').expect(401);
  });

  it('limits refresh by IP even for absent/malformed cookies and checks IP before database lookup', async () => {
    await start();
    for (let i = 0; i < 3; i++)
      await post('refresh').set('Cookie', 'test_refresh=invalid').send({}).expect(401);
    await post('refresh')
      .set('Cookie', `test_refresh=${Buffer.alloc(32, 7).toString('base64url')}`)
      .send({})
      .expect(429);
    expect(familyLookup).not.toHaveBeenCalled();
    expect(auth.refresh).toHaveBeenCalledTimes(3);
  });

  it('shares the refresh family quota across generations/IPs without trusting client family IDs', async () => {
    await start({ TRUSTED_PROXY_CIDRS: '127.0.0.1,::1' });
    familyLookup.mockResolvedValue({ familyId: 'server-family' });
    for (let i = 0; i < 3; i++) {
      const token = Buffer.alloc(32, i + 1).toString('base64url');
      await post('refresh', `192.0.2.${i + 1}`)
        .set('Cookie', `test_refresh=${token}`)
        .send({})
        .expect(i < 2 ? 401 : 429);
    }
    expect(familyLookup).toHaveBeenCalledTimes(3);
    expect(familyLookup.mock.calls[0]![0]).toHaveLength(32);
    expect(auth.refresh).toHaveBeenCalledTimes(2);
    familyLookup.mockResolvedValue({ familyId: 'another-family' });
    await post('refresh', '192.0.2.4')
      .set('Cookie', `test_refresh=${Buffer.alloc(32, 4).toString('base64url')}`)
      .send({})
      .expect(401);
  });

  it('keeps logout available after the login quota is exhausted', async () => {
    await start();
    await login('user@example.com').expect(401);
    await login('user@example.com').expect(401);
    await login('user@example.com').expect(429);
    await post('logout').send({}).expect(204);
  });

  it('documents RATE_LIMITED and Retry-After for all three endpoints', async () => {
    await start();
    const result = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    for (const route of ['register', 'login', 'refresh']) {
      expect(result.body.paths[`/api/v1/auth/${route}`].post.responses['429']).toMatchObject({
        description: 'RATE_LIMITED',
        headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } },
      });
    }
  });

  it('enforces the same account quota for concurrent requests within one instance', async () => {
    await start();
    // Listen once before the burst; Supertest must not race to start one server per request.
    await app.listen(0, '127.0.0.1');
    const results = await Promise.all(Array.from({ length: 10 }, () => login('user@example.com')));
    expect(results.filter(({ status }) => status === 401)).toHaveLength(2);
    expect(results.filter(({ status }) => status === 429)).toHaveLength(8);
    expect(auth.login).toHaveBeenCalledTimes(2);
  });

  it('does not bypass Auth when the refresh-family lookup fails', async () => {
    await start();
    familyLookup.mockRejectedValueOnce(new Error('private database detail'));
    const result = await post('refresh')
      .set('Cookie', `test_refresh=${Buffer.alloc(32, 1).toString('base64url')}`)
      .send({})
      .expect(500);
    expect(result.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(result.body)).not.toContain('private database detail');
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
