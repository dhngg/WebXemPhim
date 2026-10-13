import 'reflect-metadata';
import { type INestApplication, Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import request from 'supertest';
import { configureApplication } from '../src/config/configure-application';
import { validateEnvironment } from '../src/config/environment';
import { HealthModule } from '../src/modules/health/health.module';

// Test-only routes verify global infrastructure without shipping business endpoints.
class ProbeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  count!: number;
}

@Controller('test-probe')
class ProbeController {
  @Post()
  echo(@Body() body: ProbeDto): ProbeDto {
    return body;
  }

  @Get('error')
  fail(): never {
    throw new Error('private-password-and-stack');
  }
}

describe('Sprint 0 API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [() => validateEnvironment({ NODE_ENV: 'test', SWAGGER_ENABLED: 'true' })],
        }),
        HealthModule,
      ],
      controllers: [ProbeController],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves health under /api/v1 only', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(result.body).toMatchObject({ status: 'ok', service: 'rental-api' });
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('returns disabled readiness without credentials', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(result.body).toEqual({ status: 'ok', database: 'disabled' });
  });

  it('exposes a valid OpenAPI health schema', async () => {
    const result = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(result.body.openapi).toMatch(/^3\./);
    expect(result.body.paths['/api/v1/health'].get.responses['200']).toBeDefined();
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('transforms valid DTO input', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/test-probe')
      .send({ count: '2' })
      .expect(201);
    expect(result.body).toEqual({ count: 2 });
  });

  it.each([{ count: 0 }, { count: 1, unexpected: true }])(
    'rejects invalid or extra properties: %j',
    async (body) => {
      const result = await request(app.getHttpServer())
        .post('/api/v1/test-probe')
        .send(body)
        .expect(400);
      expect(result.body).toMatchObject({
        statusCode: 400,
        code: 'HTTP_400',
        message: 'Validation failed',
      });
      expect(result.body.errors.length).toBeGreaterThan(0);
    },
  );

  it('returns consistent 404 errors without query parameters', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/missing?secret=private-query')
      .expect(404);
    expect(result.body).toMatchObject({ code: 'HTTP_404', path: '/api/v1/missing' });
    expect(result.body.requestId).toBe(result.headers['x-request-id']);
    expect(JSON.stringify(result.body)).not.toContain('private-query');
  });

  it('hides internal exception details', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/test-probe/error').expect(500);
    expect(result.body.message).toBe('Internal server error');
    expect(JSON.stringify(result.body)).not.toContain('private-password-and-stack');
    expect(result.body.stack).toBeUndefined();
  });

  it('sets security headers and allows only configured browser origins', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    const denied = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    // CORS controls browser response access; it is not an authorization mechanism.
  });
});
