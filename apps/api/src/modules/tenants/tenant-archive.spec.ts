/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  TenantHasActiveContractRepositoryError,
  TenantNotFoundRepositoryError,
  TenantRepository,
} from './repositories/tenant.repository';
import { TenantService } from './services/tenant.service';

function repoWith(overrides: Record<string, unknown> = {}, status = 'ACTIVE', role = 'OWNER') {
  const tx: any = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ status: 'ACTIVE' }]) // workspace
      .mockResolvedValueOnce([{ status }]), // tenant
    workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role }) },
    contract: { count: jest.fn().mockResolvedValue(0) },
    tenant: {
      update: jest.fn().mockResolvedValue({ id: 't' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't' }),
    },
    ...overrides,
  };
  const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
  return { tx, repository: new TenantRepository(prisma as never) };
}

describe('Tenant archive/restore', () => {
  it('archives a tenant with no active contract and keeps history rows untouched', async () => {
    const { tx, repository } = repoWith();
    await repository.setArchived('w', 'u', 't', true);
    expect(tx.contract.count).toHaveBeenCalledWith({
      where: { tenantId: 't', workspaceId: 'w', status: 'ACTIVE' },
    });
    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: 't' },
      data: { status: 'ARCHIVED', archivedAt: expect.any(Date) },
    });
  });

  it('refuses to archive while a contract is ACTIVE', async () => {
    const { tx, repository } = repoWith({ contract: { count: jest.fn().mockResolvedValue(1) } });
    await expect(repository.setArchived('w', 'u', 't', true)).rejects.toBeInstanceOf(
      TenantHasActiveContractRepositoryError,
    );
    expect(tx.tenant.update).not.toHaveBeenCalled();
  });

  it('is idempotent when already in the target state', async () => {
    const { tx, repository } = repoWith({}, 'ARCHIVED');
    await repository.setArchived('w', 'u', 't', true);
    expect(tx.tenant.update).not.toHaveBeenCalled();
  });

  it('restore clears archived_at and skips the contract check', async () => {
    const { tx, repository } = repoWith({}, 'ARCHIVED');
    await repository.setArchived('w', 'u', 't', false);
    expect(tx.contract.count).not.toHaveBeenCalled();
    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: 't' },
      data: { status: 'ACTIVE', archivedAt: null },
    });
  });

  it('only OWNER/MANAGER may archive (STAFF sees not found)', async () => {
    const { repository } = repoWith({}, 'ACTIVE', 'STAFF');
    await expect(repository.setArchived('w', 'u', 't', true)).rejects.toThrow();
  });

  it('maps errors to application codes', async () => {
    const svc = (e: Error) =>
      new TenantService({ setArchived: jest.fn().mockRejectedValue(e) } as never);
    await expect(
      svc(new TenantHasActiveContractRepositoryError()).archive('w', 'u', 't'),
    ).rejects.toMatchObject({ code: 'TENANT_HAS_ACTIVE_CONTRACT' });
    await expect(
      svc(new TenantNotFoundRepositoryError()).restore('w', 'u', 't'),
    ).rejects.toMatchObject({
      code: 'TENANT_NOT_FOUND',
    });
  });
});
