import { Prisma } from '../../../generated/prisma/client';
import {
  RatePlanInactiveRepositoryError,
  RatePlanNotEligibleRepositoryError,
  RatePlanRepository,
} from './rate-plan.repository';

describe('RatePlanRepository', () => {
  const input = {
    code: 'ELECTRICITY',
    name: 'Electricity',
    serviceType: 'ELECTRICITY' as const,
    billingUnit: 'KWH' as const,
    unitPrice: '3500.0000',
    effectiveFrom: '2026-11-01',
  };
  const active = {
    id: 'rate-1',
    workspaceId: 'workspace-1',
    buildingId: 'building-1',
    code: 'ELECTRICITY',
    name: 'Electricity',
    serviceType: 'ELECTRICITY',
    billingUnit: 'KWH',
    unitPrice: {},
    effectiveFrom: new Date('2026-11-01'),
    effectiveTo: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const scope = () => ({
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ status: 'ACTIVE' }])
      .mockResolvedValueOnce([{ status: 'ACTIVE' }]),
    workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
  });
  it('creates a Decimal rate after locking active workspace/building scope', async () => {
    const tx = { ...scope(), ratePlan: { create: jest.fn().mockResolvedValue(active) } };
    const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    const repository = new RatePlanRepository(prisma as never);
    await expect(repository.create('workspace-1', 'owner-1', 'building-1', input)).resolves.toBe(
      active,
    );
    expect(tx.ratePlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        unitPrice: '3500.0000',
        effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
  it('versions a rate by closing the old half-open period before inserting the successor', async () => {
    const next = { ...active, id: 'rate-2', unitPrice: {}, effectiveFrom: new Date('2026-12-01') };
    const tx = {
      ...scope(),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'rate-1' }]),
      ratePlan: {
        findUnique: jest.fn().mockResolvedValue(active),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue(next),
      },
    };
    const repository = new RatePlanRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await repository.update('workspace-1', 'owner-1', 'building-1', 'rate-1', {
      unitPrice: '4000.0000',
      effectiveFrom: '2026-12-01',
    });
    expect(tx.ratePlan.update).toHaveBeenCalledWith({
      where: { id: 'rate-1' },
      data: { status: 'INACTIVE', effectiveTo: new Date('2026-12-01T00:00:00.000Z') },
    });
    expect(tx.ratePlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'ELECTRICITY',
        unitPrice: '4000.0000',
        effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
      }),
    });
  });
  it('does not mutate an inactive historical version', async () => {
    const tx = {
      ...scope(),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'rate-1' }]),
      ratePlan: { findUnique: jest.fn().mockResolvedValue({ ...active, status: 'INACTIVE' }) },
    };
    const repository = new RatePlanRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.update('workspace-1', 'owner-1', 'building-1', 'rate-1', {
        unitPrice: '4000',
        effectiveFrom: '2026-12-01',
      }),
    ).rejects.toBeInstanceOf(RatePlanInactiveRepositoryError);
  });
  it('requires a successor/stop boundary after the current effectiveFrom', async () => {
    const tx = {
      ...scope(),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'rate-1' }]),
      ratePlan: { findUnique: jest.fn().mockResolvedValue(active) },
    };
    const repository = new RatePlanRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.stop('workspace-1', 'owner-1', 'building-1', 'rate-1', {
        effectiveTo: '2026-11-01',
      }),
    ).rejects.toBeInstanceOf(RatePlanNotEligibleRepositoryError);
  });
  it('scopes list by workspace and building', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new RatePlanRepository({
      ratePlan: { findMany, count },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    } as never);
    await repository.list('workspace-1', 'building-1', {
      status: 'ACTIVE',
      serviceType: 'WATER',
      page: 2,
      limit: 10,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          buildingId: 'building-1',
          status: 'ACTIVE',
          serviceType: 'WATER',
        },
        skip: 10,
        take: 10,
      }),
    );
  });
});
