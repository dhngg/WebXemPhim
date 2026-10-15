import { Prisma } from '../../../generated/prisma/client';
import {
  VehicleInactiveRepositoryError,
  VehicleNotEligibleRepositoryError,
  VehicleRepository,
} from './vehicle.repository';

describe('VehicleRepository', () => {
  const input = { tenantId: 'tenant-1', licensePlate: '59A112345', vehicleType: 'MOTORBIKE' };
  it('creates only for an ACTIVE tenant in the same locked workspace', async () => {
    const created = { id: 'vehicle-1' };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      vehicle: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    const repository = new VehicleRepository(prisma as never);
    await expect(repository.create('workspace-1', 'owner-1', input)).resolves.toBe(created);
    expect(tx.vehicle.create).toHaveBeenCalledWith({
      data: { workspaceId: 'workspace-1', ...input },
      include: expect.any(Object),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
  it('blocks creating a vehicle for an archived tenant', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
    };
    const repository = new VehicleRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(repository.create('workspace-1', 'manager-1', input)).rejects.toBeInstanceOf(
      VehicleNotEligibleRepositoryError,
    );
  });
  it('scopes list and detail by workspace', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new VehicleRepository({
      vehicle: { findMany, count, findFirst },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    } as never);
    await repository.list('workspace-1', {
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      page: 1,
      limit: 20,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', status: 'ACTIVE', tenantId: 'tenant-1' },
      }),
    );
    await repository.detail('workspace-1', 'vehicle-1');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'vehicle-1', workspaceId: 'workspace-1' } }),
    );
  });
  it('does not update an inactive vehicle', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'INACTIVE', tenantId: 'tenant-1' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
    };
    const repository = new VehicleRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.update('workspace-1', 'owner-1', 'vehicle-1', { color: 'Red' }),
    ).rejects.toBeInstanceOf(VehicleInactiveRepositoryError);
  });
  it('stops a vehicle without deleting its billing history record', async () => {
    const result = { id: 'vehicle-1', status: 'INACTIVE' };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE', tenantId: 'tenant-1' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      vehicle: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue(result) },
    };
    const repository = new VehicleRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.stop('workspace-1', 'manager-1', 'vehicle-1', { reason: 'No longer parked' }),
    ).resolves.toBe(result);
    expect(tx.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'vehicle-1' },
      data: expect.objectContaining({ status: 'INACTIVE', inactiveReason: 'No longer parked' }),
    });
  });
});
