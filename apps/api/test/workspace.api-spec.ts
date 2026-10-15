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
import { WorkspaceModule } from '../src/modules/workspaces/workspace.module';
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

describe('Workspace API foundation', () => {
  let app: INestApplication;
  let repository: jest.Mocked<WorkspaceRepository>;
  const userId = authenticatedUser.id;
  const workspace: WorkspaceAccessRecord = {
    id: '770060ca-e063-4b27-9b10-e517ba61866e',
    name: 'Workspace A',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
    role: 'OWNER',
  };
  beforeAll(async () => {
    repository = {
      createWithOwner: jest.fn(),
      findForUser: jest.fn(),
      findAccessibleWorkspace: jest.fn(),
      archive: jest.fn(),
      restore: jest.fn(),
      listMembers: jest.fn(),
      addMember: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
      transferOwnership: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceRepository>;
    const module = await Test.createTestingModule({
      imports: [TestAuthGuardsModule, WorkspaceModule],
    })
      .overrideProvider(WorkspaceRepository)
      .useValue(repository)
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
    repository.createWithOwner.mockResolvedValue(workspace);
    repository.findForUser.mockResolvedValue([workspace]);
    repository.findAccessibleWorkspace.mockResolvedValue(workspace);
    repository.archive.mockResolvedValue({
      ...workspace,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    });
    repository.restore.mockResolvedValue(workspace);
  });

  it('creates a workspace and assigns OWNER server-side', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ name: ' Workspace A ' })
      .expect(201);
    expect(repository.createWithOwner).toHaveBeenCalledWith(userId, 'Workspace A');
    expect(result.body).toMatchObject({
      id: workspace.id,
      status: 'ACTIVE',
      currentMembership: { role: 'OWNER' },
    });
  });

  it('rejects a role supplied by the client', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ name: 'Workspace A', role: 'OWNER' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });

  it('lists only workspaces returned for the authenticated user', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', 'Bearer access-token')
      .expect(200);
    expect(repository.findForUser).toHaveBeenCalledWith(userId);
    expect(result.body).toHaveLength(1);
  });

  it('loads detail through a database membership check and hides inaccessible workspaces', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace.id}`)
      .set('Authorization', 'Bearer access-token')
      .expect(200);
    expect(repository.findAccessibleWorkspace).toHaveBeenCalledWith(userId, workspace.id);

    repository.findAccessibleWorkspace.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace.id}`)
      .set('Authorization', 'Bearer access-token')
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_NOT_FOUND'));
  });

  it('lets only an OWNER archive a workspace and returns the archived resource', async () => {
    const result = await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspace.id}/archive`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .expect(200);

    expect(repository.archive).toHaveBeenCalledWith(workspace.id, userId);
    expect(result.body).toMatchObject({
      id: workspace.id,
      status: 'ARCHIVED',
      archivedAt: '2026-10-14T01:00:00.000Z',
      currentMembership: { role: 'OWNER' },
    });

    repository.findAccessibleWorkspace.mockResolvedValueOnce({ ...workspace, role: 'MANAGER' });
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspace.id}/archive`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_NOT_FOUND'));
  });

  it('treats repeated archive and restore requests as successful current-state reads', async () => {
    const archived = {
      ...workspace,
      status: 'ARCHIVED' as const,
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    };
    repository.findAccessibleWorkspace.mockResolvedValue(archived);
    repository.archive.mockResolvedValue(archived);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspace.id}/archive`)
        .set('Authorization', 'Bearer access-token')
        .set('Origin', 'https://app.example.com')
        .set('X-CSRF-Protection', '1')
        .expect(200)
        .expect(({ body }) => expect(body.archivedAt).toBe('2026-10-14T01:00:00.000Z'));
    }

    repository.restore.mockResolvedValue(workspace);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspace.id}/restore`)
        .set('Authorization', 'Bearer access-token')
        .set('Origin', 'https://app.example.com')
        .set('X-CSRF-Protection', '1')
        .expect(200)
        .expect(({ body }) => expect(body.status).toBe('ACTIVE'));
    }
  });

  it('keeps archived workspaces readable and protects lifecycle writes with Origin/CSRF', async () => {
    repository.findAccessibleWorkspace.mockResolvedValue({
      ...workspace,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace.id}`)
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ARCHIVED'));

    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspace.id}/restore`)
      .set('Authorization', 'Bearer access-token')
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('CSRF_VALIDATION_FAILED'));
  });

  it.each([
    ['GET', 'members'],
    ['POST', 'members'],
    ['PATCH', 'members/b5f3ea0b-7158-4bd7-aee0-cbf6d274302c'],
    ['DELETE', 'members/b5f3ea0b-7158-4bd7-aee0-cbf6d274302c'],
    ['POST', 'transfer-ownership'],
  ] as const)(
    'has retired %s /workspaces/:id/%s for everyone, OWNER included',
    async (method, path) => {
      const url = `/api/v1/workspaces/${workspace.id}/${path}`;
      const server = request(app.getHttpServer());
      const call = {
        GET: server.get,
        POST: server.post,
        PATCH: server.patch,
        DELETE: server.delete,
      }[method].call(server, url);
      await call
        .set('Authorization', 'Bearer access-token')
        .set('Origin', 'https://app.example.com')
        .set('X-CSRF-Protection', '1')
        .send(
          method === 'GET' || method === 'DELETE'
            ? undefined
            : { email: 'm@example.com', role: 'MANAGER', targetMembershipId: 'x' },
        )
        .expect(404);
      expect(repository.listMembers).not.toHaveBeenCalled();
      expect(repository.addMember).not.toHaveBeenCalled();
      expect(repository.updateMemberRole).not.toHaveBeenCalled();
      expect(repository.removeMember).not.toHaveBeenCalled();
      expect(repository.transferOwnership).not.toHaveBeenCalled();
    },
  );

  it.each(['MANAGER', 'STAFF'] as const)(
    'blocks legacy %s from workspace detail and lifecycle',
    async (role) => {
      repository.findAccessibleWorkspace.mockResolvedValue({ ...workspace, role });
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace.id}`)
        .set('Authorization', 'Bearer access-token')
        .expect(404)
        .expect(({ body }) => expect(body.code).toBe('WORKSPACE_NOT_FOUND'));
      for (const action of ['archive', 'restore']) {
        await request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${workspace.id}/${action}`)
          .set('Authorization', 'Bearer access-token')
          .set('Origin', 'https://app.example.com')
          .set('X-CSRF-Protection', '1')
          .expect(404);
      }
      expect(repository.archive).not.toHaveBeenCalled();
      expect(repository.restore).not.toHaveBeenCalled();
    },
  );
});
