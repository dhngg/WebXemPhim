import 'reflect-metadata';
import { Global, type INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
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
import { BuildingModule } from '../src/modules/buildings/building.module';
import { BuildingRepository } from '../src/modules/buildings/repositories/building.repository';
import {
  WorkspaceRepository,
  type WorkspaceAccessRecord,
} from '../src/modules/workspaces/repositories/workspace.repository';

const authenticatedUser = {
  id: '1248d89d-42cc-4db1-8855-813d4ad15f08',
  email: 'owner@example.com',
  displayName: 'Owner',
  status: 'ACTIVE' as const,
  createdAt: '2026-10-14T00:00:00.000Z',
};
const authService: Pick<AuthServiceContract, 'authenticateAccessToken'> = {
  authenticateAccessToken: jest.fn().mockResolvedValue(authenticatedUser),
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
class TestAuthGuardsModule {}

describe('Building create/list API', () => {
  let app: INestApplication;
  let workspaceRepository: jest.Mocked<WorkspaceRepository>;
  let buildingRepository: jest.Mocked<BuildingRepository>;
  const workspaceId = '770060ca-e063-4b27-9b10-e517ba61866e';
  const workspace: WorkspaceAccessRecord = {
    id: workspaceId,
    name: 'Workspace A',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
    role: 'OWNER',
  };
  const building = {
    id: 'e8f122f1-c92f-4d89-a264-aa154ad36d2e',
    workspaceId,
    name: 'Nhà trọ An Bình',
    description: null,
    status: 'ACTIVE' as const,
    archivedAt: null,
    addressLine1: '12 Nguyễn Trãi',
    addressLine2: null,
    ward: null,
    district: 'Quận 1',
    city: 'Hồ Chí Minh',
    postalCode: null,
    countryCode: 'VN',
    latitude: null,
    longitude: null,
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
  };

  beforeAll(async () => {
    workspaceRepository = {
      findAccessibleWorkspace: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceRepository>;
    buildingRepository = {
      create: jest.fn(),
      list: jest.fn(),
      detail: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      restore: jest.fn(),
    } as unknown as jest.Mocked<BuildingRepository>;
    const module = await Test.createTestingModule({
      imports: [TestAuthGuardsModule, BuildingModule],
    })
      .overrideProvider(WorkspaceRepository)
      .useValue(workspaceRepository)
      .overrideProvider(BuildingRepository)
      .useValue(buildingRepository)
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
    workspaceRepository.findAccessibleWorkspace.mockResolvedValue(workspace);
    buildingRepository.create.mockResolvedValue(building as never);
    buildingRepository.list.mockResolvedValue([building] as never);
    buildingRepository.detail.mockResolvedValue(building as never);
    buildingRepository.update.mockResolvedValue({ ...building, name: 'Updated' } as never);
    buildingRepository.archive.mockResolvedValue({
      ...building,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    } as never);
    buildingRepository.restore.mockResolvedValue(building as never);
  });

  it.each(['OWNER'] as const)('allows %s to create a building', async (role) => {
    workspaceRepository.findAccessibleWorkspace.mockResolvedValueOnce({ ...workspace, role });
    const result = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/buildings`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({
        name: ' Nhà trọ An Bình ',
        addressLine1: ' 12 Nguyễn Trãi ',
        district: ' Quận 1 ',
        city: ' Hồ Chí Minh ',
      })
      .expect(201);

    expect(result.body.countryCode).toBe('VN');
    expect(buildingRepository.create).toHaveBeenLastCalledWith(
      workspaceId,
      authenticatedUser.id,
      expect.objectContaining({ name: 'Nhà trọ An Bình', city: 'Hồ Chí Minh' }),
    );
  });

  it.each(['MANAGER', 'STAFF'] as const)(
    'blocks legacy %s from every building read and write (V1 is OWNER-only)',
    async (role) => {
      workspaceRepository.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role });
      const base = `/api/v1/workspaces/${workspaceId}/buildings`;
      const send = (method: 'get' | 'post' | 'patch', path: string, body?: object) => {
        const call = request(app.getHttpServer())
          [method](`${base}${path}`)
          .set('Authorization', 'Bearer access-token')
          .set('Origin', 'https://app.example.com')
          .set('X-CSRF-Protection', '1');
        return body ? call.send(body) : call;
      };
      for (const call of [
        () => send('post', '', { name: 'Building', addressLine1: 'Address', city: 'City' }),
        () => send('get', ''),
        () => send('get', `/${building.id}`),
        () => send('patch', `/${building.id}`, { name: 'Updated' }),
        () => send('patch', `/${building.id}/archive`),
        () => send('patch', `/${building.id}/restore`),
      ]) {
        await call()
          .expect(404)
          .expect(({ body }) => expect(body.code).toBe('WORKSPACE_NOT_FOUND'));
      }
      expect(buildingRepository.create).not.toHaveBeenCalled();
      expect(buildingRepository.list).not.toHaveBeenCalled();
      expect(buildingRepository.detail).not.toHaveBeenCalled();
      expect(buildingRepository.update).not.toHaveBeenCalled();
      expect(buildingRepository.archive).not.toHaveBeenCalled();
      expect(buildingRepository.restore).not.toHaveBeenCalled();
    },
  );

  it('blocks create when the workspace is archived', async () => {
    workspaceRepository.findAccessibleWorkspace.mockResolvedValueOnce({
      ...workspace,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    });
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/buildings`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ name: 'Building', addressLine1: 'Address', city: 'City' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_ARCHIVED'));
    expect(buildingRepository.create).not.toHaveBeenCalled();
  });

  it('requires latitude and longitude as a valid pair', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/buildings`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({
        name: 'Building',
        addressLine1: 'Address',
        city: 'City',
        latitude: 10.7,
      })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });

  it('keeps the detail lookup scoped to the workspace for OWNER', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/buildings/${building.id}`)
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(building.id));
    expect(buildingRepository.detail).toHaveBeenCalledWith(workspaceId, building.id);
  });

  it('returns BUILDING_NOT_FOUND when detail is outside the workspace scope', async () => {
    buildingRepository.detail.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/buildings/${building.id}`)
      .set('Authorization', 'Bearer access-token')
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('BUILDING_NOT_FOUND'));
  });

  it.each(['OWNER'] as const)('allows %s to update an ACTIVE building', async (role) => {
    workspaceRepository.findAccessibleWorkspace.mockResolvedValueOnce({ ...workspace, role });
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/buildings/${building.id}`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ name: ' Updated ' })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe('Updated'));
    expect(buildingRepository.update).toHaveBeenLastCalledWith(
      workspaceId,
      authenticatedUser.id,
      building.id,
      { name: 'Updated' },
    );
  });

  it('blocks STAFF update and rejects an empty OWNER update', async () => {
    workspaceRepository.findAccessibleWorkspace.mockResolvedValueOnce({
      ...workspace,
      role: 'STAFF',
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/buildings/${building.id}`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ name: 'Updated' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/buildings/${building.id}`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({})
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });

  it('allows only OWNER to archive and restore a building', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/buildings/${building.id}/archive`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ARCHIVED'));
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/buildings/${building.id}/restore`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ACTIVE'));

    workspaceRepository.findAccessibleWorkspace.mockResolvedValueOnce({
      ...workspace,
      role: 'MANAGER',
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/buildings/${building.id}/archive`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .expect(404);
  });

  it.each(['update', 'archive', 'restore'] as const)(
    'blocks %s while the workspace is archived',
    async (operation) => {
      workspaceRepository.findAccessibleWorkspace.mockResolvedValueOnce({
        ...workspace,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-10-14T01:00:00.000Z'),
      });
      const path =
        operation === 'update'
          ? `/api/v1/workspaces/${workspaceId}/buildings/${building.id}`
          : `/api/v1/workspaces/${workspaceId}/buildings/${building.id}/${operation}`;
      await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', 'Bearer access-token')
        .set('Origin', 'https://app.example.com')
        .set('X-CSRF-Protection', '1')
        .send(operation === 'update' ? { name: 'Updated' } : undefined)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('WORKSPACE_ARCHIVED'));
    },
  );
});
