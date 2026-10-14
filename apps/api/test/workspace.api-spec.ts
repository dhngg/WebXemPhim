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
  WorkspaceMemberAlreadyExistsRepositoryError,
  WorkspaceMemberNotFoundRepositoryError,
  WorkspaceOwnerConflictRepositoryError,
  WorkspaceOwnerProtectedRepositoryError,
  WorkspaceRepository,
  type WorkspaceAccessRecord,
  type WorkspaceMemberRecord,
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
  const member: WorkspaceMemberRecord = {
    id: 'b5f3ea0b-7158-4bd7-aee0-cbf6d274302c',
    role: 'MANAGER',
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
    user: {
      id: '25dc48f1-71e6-4ad1-9c2f-29db4b565f73',
      email: 'member@example.com',
      displayName: 'Member',
    },
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
    repository.createWithOwner.mockResolvedValue(workspace);
    repository.findForUser.mockResolvedValue([workspace]);
    repository.findAccessibleWorkspace.mockResolvedValue(workspace);
    repository.archive.mockResolvedValue({
      ...workspace,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    });
    repository.restore.mockResolvedValue(workspace);
    repository.listMembers.mockResolvedValue([member]);
    repository.addMember.mockResolvedValue(member);
    repository.updateMemberRole.mockResolvedValue({ ...member, role: 'STAFF' });
    repository.removeMember.mockResolvedValue();
    repository.transferOwnership.mockResolvedValue();
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

  it('allows only OWNER to list members, including while archived', async () => {
    const result = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace.id}/members`)
      .set('Authorization', 'Bearer access-token')
      .expect(200);
    expect(repository.listMembers).toHaveBeenCalledWith(workspace.id, userId);
    expect(result.body).toEqual([
      expect.objectContaining({
        id: member.id,
        role: 'MANAGER',
        user: expect.objectContaining({ email: 'member@example.com' }),
      }),
    ]);

    repository.findAccessibleWorkspace.mockResolvedValueOnce({
      ...workspace,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    });
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace.id}/members`)
      .set('Authorization', 'Bearer access-token')
      .expect(200);

    repository.findAccessibleWorkspace.mockResolvedValueOnce({ ...workspace, role: 'MANAGER' });
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace.id}/members`)
      .set('Authorization', 'Bearer access-token')
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_NOT_FOUND'));
  });

  it('normalizes email and adds only a MANAGER or STAFF', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/members`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ email: ' MEMBER@Example.COM ', role: 'MANAGER' })
      .expect(201)
      .expect(({ body }) => expect(body.id).toBe(member.id));
    expect(repository.addMember).toHaveBeenCalledWith(
      workspace.id,
      userId,
      'member@example.com',
      'MANAGER',
    );

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/members`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'owner@example.com', role: 'OWNER' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });

  it('updates MANAGER/STAFF and removes a non-owner membership', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspace.id}/members/${member.id}`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ role: 'STAFF' })
      .expect(200)
      .expect(({ body }) => expect(body.role).toBe('STAFF'));
    expect(repository.updateMemberRole).toHaveBeenCalledWith(
      workspace.id,
      userId,
      member.id,
      'STAFF',
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspace.id}/members/${member.id}`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .expect(204);
    expect(repository.removeMember).toHaveBeenCalledWith(workspace.id, userId, member.id);
  });

  it('protects OWNER and maps duplicate membership through the public contract', async () => {
    repository.updateMemberRole.mockRejectedValueOnce(new WorkspaceOwnerProtectedRepositoryError());
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspace.id}/members/${member.id}`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ role: 'STAFF' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_OWNER_PROTECTED'));

    repository.addMember.mockRejectedValueOnce(new WorkspaceMemberAlreadyExistsRepositoryError());
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/members`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'member@example.com', role: 'STAFF' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_MEMBER_ALREADY_EXISTS'));

    repository.removeMember.mockRejectedValueOnce(new WorkspaceOwnerProtectedRepositoryError());
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspace.id}/members/${member.id}`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_OWNER_PROTECTED'));

    repository.addMember.mockRejectedValueOnce(new WorkspaceMemberNotFoundRepositoryError());
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/members`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'missing@example.com', role: 'STAFF' })
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_MEMBER_NOT_FOUND'));
  });

  it('blocks every membership write when the workspace is archived', async () => {
    repository.findAccessibleWorkspace.mockResolvedValue({
      ...workspace,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/members`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'member@example.com', role: 'STAFF' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_ARCHIVED'));
    expect(repository.addMember).not.toHaveBeenCalled();
  });

  it('transfers ownership only for the current OWNER and an ACTIVE target membership', async () => {
    repository.transferOwnership.mockResolvedValueOnce();
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/transfer-ownership`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ targetMembershipId: member.id })
      .expect(204);
    expect(repository.transferOwnership).toHaveBeenCalledWith(workspace.id, userId, member.id);

    repository.findAccessibleWorkspace.mockResolvedValueOnce({ ...workspace, role: 'MANAGER' });
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/transfer-ownership`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ targetMembershipId: member.id })
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_NOT_FOUND'));
  });

  it('blocks ownership transfer for archived workspaces and invalid targets', async () => {
    repository.findAccessibleWorkspace.mockResolvedValueOnce({
      ...workspace,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    });
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/transfer-ownership`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ targetMembershipId: member.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_ARCHIVED'));

    repository.transferOwnership.mockRejectedValueOnce(
      new WorkspaceMemberNotFoundRepositoryError(),
    );
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace.id}/transfer-ownership`)
      .set('Authorization', 'Bearer access-token')
      .set('Origin', 'https://app.example.com')
      .set('X-CSRF-Protection', '1')
      .send({ targetMembershipId: member.id })
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('WORKSPACE_MEMBER_NOT_FOUND'));
  });

  it('returns one success and one conflict for concurrent transfer requests by the same OWNER', async () => {
    let claimed = false;
    repository.transferOwnership.mockImplementation(async () => {
      await Promise.resolve();
      if (claimed) throw new WorkspaceOwnerConflictRepositoryError();
      claimed = true;
    });

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspace.id}/transfer-ownership`)
        .set('Authorization', 'Bearer access-token')
        .set('Origin', 'https://app.example.com')
        .set('X-CSRF-Protection', '1')
        .send({ targetMembershipId: member.id }),
      request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspace.id}/transfer-ownership`)
        .set('Authorization', 'Bearer access-token')
        .set('Origin', 'https://app.example.com')
        .set('X-CSRF-Protection', '1')
        .send({ targetMembershipId: 'a8b9ea5e-ab95-4827-953e-62eb24859fc2' }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict?.body.code).toBe('WORKSPACE_OWNER_CONFLICT');
  });
});
