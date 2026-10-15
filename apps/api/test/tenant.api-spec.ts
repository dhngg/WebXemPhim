import 'reflect-metadata';
import { Global, type INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApplicationException } from '../src/common/errors/application-exception';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import {
  AUTH_HTTP_SECURITY,
  AccessAuthGuard,
  AuthOriginGuard,
} from '../src/modules/auth/http/auth-http-security';
import {
  AUTH_SERVICE,
  type AuthServiceContract,
} from '../src/modules/auth/services/auth-service.contract';
import { TenantRepository } from '../src/modules/tenants/repositories/tenant.repository';
import { TenantLinkRepository } from '../src/modules/tenants/repositories/tenant-link.repository';
import { TenantModule } from '../src/modules/tenants/tenant.module';
import {
  WorkspaceRepository,
  type WorkspaceAccessRecord,
} from '../src/modules/workspaces/repositories/workspace.repository';

const user = {
  id: '1248d89d-42cc-4db1-8855-813d4ad15f08',
  email: 'owner@example.com',
  displayName: 'Owner',
  status: 'ACTIVE' as const,
  createdAt: '2026-10-14T00:00:00.000Z',
};
const authService: Pick<AuthServiceContract, 'authenticateAccessToken'> = {
  authenticateAccessToken: jest.fn().mockResolvedValue(user),
};
@Global()
@Module({
  providers: [
    { provide: AUTH_SERVICE, useValue: authService },
    {
      provide: AUTH_HTTP_SECURITY,
      useValue: {
        enabled: true,
        allowedOrigins: ['https://app.example.com'],
        refreshCookieName: '__Host-rental_refresh',
        secureCookie: true,
      },
    },
    AuthOriginGuard,
    AccessAuthGuard,
  ],
  exports: [AUTH_SERVICE, AUTH_HTTP_SECURITY, AuthOriginGuard, AccessAuthGuard],
})
class TestAuthModule {}

describe('Tenant API', () => {
  let app: INestApplication;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let tenants: jest.Mocked<TenantRepository>;
  let links: jest.Mocked<TenantLinkRepository>;
  const workspaceId = '770060ca-e063-4b27-9b10-e517ba61866e';
  const tenantId = '58fdf255-54cb-4753-a8c8-a36fdd1df074';
  const now = new Date('2026-10-14T00:00:00.000Z');
  const workspace: WorkspaceAccessRecord = {
    id: workspaceId,
    name: 'Workspace',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    role: 'OWNER',
  };
  const tenant = {
    id: tenantId,
    workspaceId,
    fullName: 'Nguyễn Văn A',
    phone: '+84901234567',
    email: 'tenant@example.com',
    dateOfBirth: new Date('1995-05-20T00:00:00.000Z'),
    address: 'Quận 1, TP.HCM',
    notes: 'Ghi chú nội bộ',
    status: 'ACTIVE' as const,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  beforeAll(async () => {
    workspaces = {
      findAccessibleWorkspace: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceRepository>;
    links = { listActiveLinks: jest.fn() } as unknown as jest.Mocked<TenantLinkRepository>;
    tenants = {
      create: jest.fn(),
      list: jest.fn(),
      detail: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<TenantRepository>;
    const module = await Test.createTestingModule({ imports: [TestAuthModule, TenantModule] })
      .overrideProvider(WorkspaceRepository)
      .useValue(workspaces)
      .overrideProvider(TenantRepository)
      .useValue(tenants)
      .overrideProvider(TenantLinkRepository)
      .useValue(links)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    (authService.authenticateAccessToken as jest.Mock).mockImplementation(
      async (accessToken: string) => {
        if (!accessToken) throw new ApplicationException('UNAUTHORIZED');
        return user;
      },
    );
    workspaces.findAccessibleWorkspace.mockResolvedValue(workspace);
    tenants.create.mockResolvedValue(tenant);
    tenants.list.mockResolvedValue({ items: [tenant], total: 1 });
    tenants.detail.mockResolvedValue(tenant);
    tenants.update.mockResolvedValue({ ...tenant, fullName: 'Nguyễn Văn B' });
    links.listActiveLinks.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        workspaceId,
        tenantId,
        userId: '66666666-6666-4666-8666-666666666666',
        invitationId: null,
        linkRequestId: null,
        approvedByUserId: null,
        revokedByUserId: null,
        linkedAt: now,
        revokedAt: null,
        user: {
          id: '66666666-6666-4666-8666-666666666666',
          email: 'linked@example.com',
          displayName: 'Người thuê',
        },
      } as never,
    ]);
  });
  const authHeaders = (call: request.Test) => call.set('Authorization', 'Bearer token');
  const writeHeaders = (call: request.Test) =>
    authHeaders(call).set('Origin', 'https://app.example.com').set('X-CSRF-Protection', '1');
  const base = () => `/api/v1/workspaces/${workspaceId}/tenants`;

  it('lets OWNER create a normalized tenant profile', async () => {
    await writeHeaders(request(app.getHttpServer()).post(base()))
      .send({
        fullName: ' Nguyễn Văn A ',
        phone: '0901 234 567',
        email: ' Tenant@Example.com ',
        dateOfBirth: '1995-05-20',
      })
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          id: tenantId,
          fullName: 'Nguyễn Văn A',
          dateOfBirth: '1995-05-20',
        }),
      );
    expect(tenants.create).toHaveBeenCalledWith(
      workspaceId,
      user.id,
      expect.objectContaining({
        fullName: 'Nguyễn Văn A',
        phone: '0901234567',
        email: 'tenant@example.com',
      }),
    );
  });

  it.each(['MANAGER', 'STAFF'] as const)('blocks legacy %s from tenant profiles', async (role) => {
    workspaces.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role });
    await authHeaders(request(app.getHttpServer()).get(base())).expect(404);
    await authHeaders(request(app.getHttpServer()).get(`${base()}/${tenantId}`)).expect(404);
    await writeHeaders(request(app.getHttpServer()).patch(`${base()}/${tenantId}`))
      .send({ fullName: 'Changed' })
      .expect(404);
    expect(tenants.list).not.toHaveBeenCalled();
    expect(tenants.update).not.toHaveBeenCalled();
  });

  it('scopes list/detail through the authorized workspace and paginates', async () => {
    await authHeaders(request(app.getHttpServer()).get(base()))
      .query({ status: 'ACTIVE', page: 1, limit: 10 })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ total: 1, page: 1, limit: 10 }));
    expect(tenants.list).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ status: 'ACTIVE', page: 1, limit: 10 }),
    );
    await authHeaders(request(app.getHttpServer()).get(`${base()}/${tenantId}`)).expect(200);
    expect(tenants.detail).toHaveBeenCalledWith(workspaceId, tenantId);
  });

  it('updates a profile and supports explicitly clearing optional PII', async () => {
    await writeHeaders(request(app.getHttpServer()).patch(`${base()}/${tenantId}`))
      .send({ fullName: ' Nguyễn Văn B ', email: null, phone: null })
      .expect(200)
      .expect(({ body }) => expect(body.fullName).toBe('Nguyễn Văn B'));
    expect(tenants.update).toHaveBeenCalledWith(workspaceId, user.id, tenantId, {
      fullName: 'Nguyễn Văn B',
      email: null,
      phone: null,
    });
  });

  it('rejects invalid/future birth dates and empty updates', async () => {
    await writeHeaders(request(app.getHttpServer()).post(base()))
      .send({ fullName: 'A', dateOfBirth: '2026-02-31' })
      .expect(400);
    await writeHeaders(request(app.getHttpServer()).post(base()))
      .send({ fullName: 'A', dateOfBirth: '2999-01-01' })
      .expect(400);
    await writeHeaders(request(app.getHttpServer()).patch(`${base()}/${tenantId}`))
      .send({})
      .expect(400);
  });

  it('does not expose tenant data through any public route', async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
    await request(app.getHttpServer()).get(`${base()}/${tenantId}`).expect(401);
  });

  describe('GET tenants/:tenantId/user-links', () => {
    const url = () => `${base()}/${tenantId}/user-links`;

    it('lets the OWNER read the ACTIVE link with the linked user and no secret fields', async () => {
      await authHeaders(request(app.getHttpServer()).get(url()))
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveLength(1);
          expect(body[0]).toMatchObject({
            id: '55555555-5555-4555-8555-555555555555',
            tenantId,
            revokedAt: null,
            user: { email: 'linked@example.com', displayName: 'Người thuê' },
          });
          expect(JSON.stringify(body)).not.toMatch(/tokenHash|token_hash|invitation/i);
        });
      expect(links.listActiveLinks).toHaveBeenCalledWith(workspaceId, user.id, tenantId);
    });

    it.each(['MANAGER', 'STAFF'] as const)(
      'rejects a legacy %s without calling the repository',
      async (role) => {
        workspaces.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role });
        await authHeaders(request(app.getHttpServer()).get(url())).expect(404);
        expect(links.listActiveLinks).not.toHaveBeenCalled();
      },
    );

    it('requires authentication and a UUID tenant id', async () => {
      await request(app.getHttpServer()).get(url()).expect(401);
      await authHeaders(request(app.getHttpServer()).get(`${base()}/not-a-uuid/user-links`)).expect(
        400,
      );
    });
  });
});
