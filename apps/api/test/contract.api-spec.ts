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
import { ContractModule } from '../src/modules/contracts/contract.module';
import {
  ContractConflictRepositoryError,
  ContractEndDateRequiredRepositoryError,
  ContractNotEligibleRepositoryError,
  ContractRepository,
} from '../src/modules/contracts/repositories/contract.repository';
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

describe('Contract API (date-based effectiveness)', () => {
  let app: INestApplication;
  let workspaces: jest.Mocked<WorkspaceRepository>;
  let contracts: jest.Mocked<ContractRepository>;
  const workspaceId = '770060ca-e063-4b27-9b10-e517ba61866e';
  const roomId = '0b9f7f9e-8c5a-4a8e-9a43-2a0a4b5a0001';
  const tenantId = '58fdf255-54cb-4753-a8c8-a36fdd1df074';
  const contractId = '9a1d7a58-2b43-4d6b-8d8e-7c2f0b1e0002';
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
  const record = (over: Record<string, unknown> = {}) => ({
    id: contractId,
    workspaceId,
    roomId,
    tenantId,
    startDate: new Date('2099-01-01T00:00:00.000Z'),
    endDate: new Date('2099-12-31T00:00:00.000Z'),
    monthlyRent: { toFixed: () => '3500000.00' },
    status: 'ACTIVE',
    notes: null,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    room: { id: roomId, code: 'P101', buildingId: 'b' },
    tenant: { id: tenantId, fullName: 'Nguyễn Văn A' },
    ...over,
  });

  beforeAll(async () => {
    workspaces = {
      findAccessibleWorkspace: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceRepository>;
    contracts = {
      create: jest.fn(),
      list: jest.fn(),
      detail: jest.fn(),
      update: jest.fn(),
      end: jest.fn(),
      listForTenantUser: jest.fn(),
      detailForTenantUser: jest.fn(),
    } as unknown as jest.Mocked<ContractRepository>;
    const module = await Test.createTestingModule({ imports: [TestAuthModule, ContractModule] })
      .overrideProvider(WorkspaceRepository)
      .useValue(workspaces)
      .overrideProvider(ContractRepository)
      .useValue(contracts)
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
    contracts.create.mockResolvedValue(record() as never);
    contracts.end.mockResolvedValue(
      record({ status: 'ENDED', endedAt: new Date('2026-10-14T03:00:00.000Z') }) as never,
    );
    contracts.update.mockResolvedValue(record() as never);
  });

  const auth = (call: request.Test) => call.set('Authorization', 'Bearer token');
  const write = (call: request.Test) =>
    auth(call).set('Origin', 'https://app.example.com').set('X-CSRF-Protection', '1');
  const base = () => `/api/v1/workspaces/${workspaceId}/contracts`;
  const future = {
    roomId,
    tenantId,
    startDate: '2099-01-01',
    endDate: '2099-12-31',
    monthlyRent: '3500000.00',
  };

  it('creates a contract that starts in the future and reports it as ACTIVE / UPCOMING', async () => {
    await write(request(app.getHttpServer()).post(base()))
      .send(future)
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          status: 'ACTIVE',
          phase: 'UPCOMING',
          startDate: '2099-01-01',
          endDate: '2099-12-31',
        }),
      );
    expect(contracts.create).toHaveBeenCalledWith(
      workspaceId,
      user.id,
      expect.objectContaining({ startDate: '2099-01-01' }),
    );
  });

  it('still refuses a period that already ended or is inverted, before touching the database', async () => {
    await write(request(app.getHttpServer()).post(base()))
      .send({ ...future, startDate: '2020-01-01', endDate: '2020-12-31' })
      .expect(409);
    await write(request(app.getHttpServer()).post(base()))
      .send({ ...future, startDate: '2099-12-31', endDate: '2099-01-01' })
      .expect(409);
    expect(contracts.create).not.toHaveBeenCalled();
  });

  it('maps an overlapping/concurrent second contract of the same room to CONTRACT_CONFLICT (409)', async () => {
    contracts.create.mockRejectedValue(new ContractConflictRepositoryError());
    await write(request(app.getHttpServer()).post(base()))
      .send(future)
      .expect(409)
      .expect(({ body }) => expect(body.error?.code ?? body.code).toBe('CONTRACT_CONFLICT'));
  });

  it('maps an ineligible room (e.g. UNAVAILABLE) to CONTRACT_NOT_ELIGIBLE', async () => {
    contracts.create.mockRejectedValue(new ContractNotEligibleRepositoryError());
    await write(request(app.getHttpServer()).post(base())).send(future).expect(409);
  });

  it('cancels a contract that has not started with an empty body, and ends a started one with its effective date', async () => {
    await write(request(app.getHttpServer()).patch(`${base()}/${contractId}/end`))
      .send({})
      .expect(200);
    expect(contracts.end).toHaveBeenLastCalledWith(workspaceId, user.id, contractId, {});
    await write(request(app.getHttpServer()).patch(`${base()}/${contractId}/end`))
      .send({ endDate: '2026-10-14' })
      .expect(200);
    expect(contracts.end).toHaveBeenLastCalledWith(workspaceId, user.id, contractId, {
      endDate: '2026-10-14',
    });
  });

  it('returns 400 when ending a started contract without its effective date, and for malformed or unknown fields', async () => {
    contracts.end.mockRejectedValue(new ContractEndDateRequiredRepositoryError());
    await write(request(app.getHttpServer()).patch(`${base()}/${contractId}/end`))
      .send({})
      .expect(400);
    contracts.end.mockClear();
    await write(request(app.getHttpServer()).patch(`${base()}/${contractId}/end`))
      .send({ endDate: '14/10/2026' })
      .expect(400);
    await write(request(app.getHttpServer()).patch(`${base()}/${contractId}/end`))
      .send({ refund: true })
      .expect(400);
    expect(contracts.end).not.toHaveBeenCalled();
  });

  it.each(['MANAGER', 'STAFF'] as const)(
    'blocks legacy %s from every contract write',
    async (role) => {
      workspaces.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role });
      await write(request(app.getHttpServer()).post(base())).send(future).expect(404);
      await write(request(app.getHttpServer()).patch(`${base()}/${contractId}`))
        .send({ notes: 'x' })
        .expect(404);
      await write(request(app.getHttpServer()).patch(`${base()}/${contractId}/end`))
        .send({})
        .expect(404);
      await auth(request(app.getHttpServer()).get(base())).expect(404);
      expect(contracts.create).not.toHaveBeenCalled();
      expect(contracts.update).not.toHaveBeenCalled();
      expect(contracts.end).not.toHaveBeenCalled();
      expect(contracts.list).not.toHaveBeenCalled();
    },
  );

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
  });

  it('shows a tenant their contract before it starts, with its phase and without any maintenance coupling', async () => {
    contracts.listForTenantUser.mockResolvedValue({ items: [record()], total: 1 } as never);
    await auth(request(app.getHttpServer()).get('/api/v1/contracts/me'))
      .expect(200)
      .expect(({ body }) =>
        expect(body.items[0]).toMatchObject({
          id: contractId,
          status: 'ACTIVE',
          phase: 'UPCOMING',
        }),
      );
    contracts.detailForTenantUser.mockResolvedValue(record() as never);
    await auth(request(app.getHttpServer()).get(`/api/v1/contracts/me/${contractId}`)).expect(200);
  });

  it('reports an ended-before-start contract as CANCELLED and keeps its registered period', async () => {
    contracts.detail.mockResolvedValue(
      record({ status: 'ENDED', endedAt: new Date('2026-10-14T03:00:00.000Z') }) as never,
    );
    await auth(request(app.getHttpServer()).get(`${base()}/${contractId}`))
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          status: 'ENDED',
          phase: 'CANCELLED',
          startDate: '2099-01-01',
          endDate: '2099-12-31',
        }),
      );
  });
});
