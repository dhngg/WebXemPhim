import { CapabilitiesRepository } from './capabilities.repository';

describe('CapabilitiesRepository V1 RBAC', () => {
  it('queries OWNER memberships only while retaining independent tenant and admin capabilities', async () => {
    const prisma = {
      workspaceMembership: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: 'OWNER',
            workspace: { id: 'workspace-1', name: 'Workspace', status: 'ACTIVE' },
          },
        ]),
      },
      tenantUserLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            tenant: { id: 'tenant-1', fullName: 'Tenant' },
            workspace: { id: 'workspace-2', name: 'Tenant workspace' },
          },
        ]),
      },
      platformAdmin: { findUnique: jest.fn().mockResolvedValue({ userId: 'user-1' }) },
      landlordApplication: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const repository = new CapabilitiesRepository(prisma as never);

    await expect(repository.get('user-1')).resolves.toMatchObject({
      workspaces: [{ id: 'workspace-1', name: 'Workspace', status: 'ACTIVE', role: 'OWNER' }],
      tenantLinks: [
        {
          tenantId: 'tenant-1',
          workspaceId: 'workspace-2',
          tenantName: 'Tenant',
          workspaceName: 'Tenant workspace',
        },
      ],
      isPlatformAdmin: true,
    });
    expect(prisma.workspaceMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', role: 'OWNER' } }),
    );
  });
});
