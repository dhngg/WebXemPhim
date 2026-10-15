import { Prisma } from '../../../generated/prisma/client';
import { WorkspaceNotFoundRepositoryError } from '../../workspaces/repositories/workspace.repository';
import { TenantNotFoundRepositoryError } from './tenant.repository';
import {
  TenantLinkRepository,
  TenantLinkRequestConflictRepositoryError,
  TenantLinkRequestInvalidTransitionRepositoryError,
} from './tenant-link.repository';

describe('TenantLinkRepository', () => {
  it('creates a request for the authenticated user without matching identity fields', async () => {
    const created = { id: 'request-1' };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ workspaceId: 'workspace-1', status: 'ACTIVE' }]),
      tenant: { findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      tenantUserLink: { findFirst: jest.fn().mockResolvedValue(null) },
      tenantLinkRequest: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    const repository = new TenantLinkRepository(prisma as never);
    await expect(
      repository.createRequest('user-1', 'tenant-1', { message: 'Verify me' }),
    ).resolves.toBe(created);
    expect(tx.tenantLinkRequest.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'workspace-1',
        tenantId: 'tenant-1',
        requesterUserId: 'user-1',
        message: 'Verify me',
      },
      include: expect.any(Object),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects a request when the tenant or user already has an active link in the workspace', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ workspaceId: 'workspace-1', status: 'ACTIVE' }]),
      tenant: { findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      tenantUserLink: { findFirst: jest.fn().mockResolvedValue({ id: 'link-1' }) },
    };
    const repository = new TenantLinkRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(repository.createRequest('user-1', 'tenant-1', {})).rejects.toBeInstanceOf(
      TenantLinkRequestConflictRepositoryError,
    );
  });

  it('approves and creates the link atomically after locking a pending request', async () => {
    const request = {
      id: 'request-1',
      tenantId: 'tenant-1',
      requesterUserId: 'user-1',
      tenant: {},
      requester: {},
    };
    const link = { id: 'link-1' };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'request-1', status: 'PENDING' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      tenantLinkRequest: {
        findFirst: jest.fn().mockResolvedValue({ tenantId: 'tenant-1', requesterUserId: 'user-1' }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(request),
        findUnique: jest.fn().mockResolvedValue(request),
      },
      tenantUserLink: { create: jest.fn().mockResolvedValue(link) },
    };
    const repository = new TenantLinkRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(repository.approve('workspace-1', 'owner-1', 'request-1', {})).resolves.toEqual({
      request,
      link,
    });
    expect(tx.tenantUserLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        tenantId: 'tenant-1',
        linkRequestId: 'request-1',
      }),
    });
    expect(tx.tenantLinkRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: expect.objectContaining({ status: 'APPROVED', decidedByUserId: 'owner-1' }),
    });
  });

  it('blocks a second decision on a non-pending request', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'request-1', status: 'APPROVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
    };
    const repository = new TenantLinkRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.reject('workspace-1', 'manager-1', 'request-1', {}),
    ).rejects.toBeInstanceOf(TenantLinkRequestInvalidTransitionRepositoryError);
  });

  it('returns only active own links for tenant self access', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new TenantLinkRepository({ tenant: { findMany } } as never);
    await repository.listLinkedTenants('user-1');
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        userLinks: { some: { userId: 'user-1', revokedAt: null } },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  });

  it('accepts an invitation once and creates a link only to its exact tenant and workspace', async () => {
    const invitation = {
      id: 'invite-1',
      workspaceId: 'workspace-1',
      tenantId: 'tenant-1',
      createdByUserId: 'manager-1',
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([invitation]),
      tenant: { findFirst: jest.fn().mockResolvedValue({ id: invitation.tenantId }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'tenant-user' }) },
      tenantUserLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'link-1',
          workspaceId: invitation.workspaceId,
          tenantId: invitation.tenantId,
          userId: 'tenant-user',
          linkedAt: new Date(),
          revokedAt: null,
        }),
      },
      tenantInvitation: { update: jest.fn().mockResolvedValue({}) },
    };
    const repository = new TenantLinkRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);

    await repository.acceptInvitation('tenant-user', new Uint8Array(32), new Date());
    expect(tx.tenantUserLink.create).toHaveBeenCalledWith({
      data: {
        workspaceId: invitation.workspaceId,
        tenantId: invitation.tenantId,
        userId: 'tenant-user',
        linkRequestId: null,
        invitationId: 'invite-1',
        approvedByUserId: 'manager-1',
      },
    });
    expect(tx.tenantInvitation.update).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
      data: {
        acceptedAt: expect.any(Date),
        acceptedByUserId: 'tenant-user',
      },
    });
  });

  describe('listActiveLinks (OWNER read of a tenant account link)', () => {
    const make = (role: string | null, tenant: object | null, links: object[] = []) => {
      const prisma = {
        workspaceMembership: { findUnique: jest.fn().mockResolvedValue(role ? { role } : null) },
        tenant: { findFirst: jest.fn().mockResolvedValue(tenant) },
        tenantUserLink: { findMany: jest.fn().mockResolvedValue(links) },
      };
      return { prisma, repository: new TenantLinkRepository(prisma as never) };
    };

    it('returns only ACTIVE links of this tenant inside this workspace, with the linked user and no token data', async () => {
      const link = { id: 'link-1', user: { id: 'u', email: 'u@x.vn', displayName: null } };
      const { prisma, repository } = make('OWNER', { id: 'tenant-1' }, [link]);
      await expect(repository.listActiveLinks('ws-1', 'owner-1', 'tenant-1')).resolves.toEqual([
        link,
      ]);
      expect(prisma.tenant.findFirst).toHaveBeenCalledWith({
        where: { id: 'tenant-1', workspaceId: 'ws-1' },
        select: { id: true },
      });
      expect(prisma.tenantUserLink.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', tenantId: 'tenant-1', revokedAt: null },
        include: { user: { select: { id: true, email: true, displayName: true } } },
        orderBy: { linkedAt: 'desc' },
      });
    });

    it.each(['MANAGER', 'STAFF', null])(
      'refuses a non-OWNER (%s) before touching any link data',
      async (role) => {
        const { prisma, repository } = make(role, { id: 'tenant-1' });
        await expect(repository.listActiveLinks('ws-1', 'u', 'tenant-1')).rejects.toBeInstanceOf(
          WorkspaceNotFoundRepositoryError,
        );
        expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
        expect(prisma.tenantUserLink.findMany).not.toHaveBeenCalled();
      },
    );

    it('hides a tenant of another workspace as not found', async () => {
      const { prisma, repository } = make('OWNER', null);
      await expect(
        repository.listActiveLinks('ws-1', 'owner-1', 'tenant-of-ws-2'),
      ).rejects.toBeInstanceOf(TenantNotFoundRepositoryError);
      expect(prisma.tenantUserLink.findMany).not.toHaveBeenCalled();
    });
  });
});
