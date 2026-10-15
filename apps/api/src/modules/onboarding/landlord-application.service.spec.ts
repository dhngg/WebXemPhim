import { Prisma } from '../../generated/prisma/client';
import { LandlordApplicationService } from './landlord-application.service';

describe('LandlordApplicationService', () => {
  const application = {
    id: 'application-1',
    userId: 'applicant-1',
    status: 'PENDING',
    reason: 'I manage rental units',
    decisionNote: null,
    decidedAt: null,
    createdAt: new Date('2026-10-15T00:00:00.000Z'),
    updatedAt: new Date('2026-10-15T00:00:00.000Z'),
  };

  it('creates a pending application after serializing and checking abuse limits', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      workspaceMembership: { findFirst: jest.fn().mockResolvedValue(null) },
      landlordApplication: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(application),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    const service = new LandlordApplicationService(prisma as never);
    await expect(service.submit('applicant-1', application.reason)).resolves.toMatchObject({
      id: application.id,
      status: 'PENDING',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('prevents self approval and duplicate decisions', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: application.id, user_id: 'admin-1', status: 'PENDING' }]),
      platformAdmin: { findUnique: jest.fn() },
      landlordApplication: { update: jest.fn() },
      adminAuditLog: { create: jest.fn() },
    };
    const service = new LandlordApplicationService({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      service.decide('admin-1', application.id, 'APPROVED', 'Verified'),
    ).rejects.toMatchObject({
      code: 'LANDLORD_APPLICATION_INVALID_TRANSITION',
    });
    expect(tx.platformAdmin.findUnique).not.toHaveBeenCalled();
    expect(tx.landlordApplication.update).not.toHaveBeenCalled();
  });

  it('updates the application and writes its audit record atomically', async () => {
    const updated = {
      ...application,
      status: 'APPROVED',
      decisionNote: 'Verified',
      decidedAt: new Date(),
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: application.id, user_id: 'applicant-1', status: 'PENDING' }]),
      platformAdmin: { findUnique: jest.fn().mockResolvedValue({ user: { status: 'ACTIVE' } }) },
      landlordApplication: { update: jest.fn().mockResolvedValue(updated) },
      adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new LandlordApplicationService({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      service.decide('admin-2', application.id, 'APPROVED', 'Verified'),
    ).resolves.toMatchObject({
      status: 'APPROVED',
      decisionNote: 'Verified',
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'admin-2',
        action: 'LANDLORD_APPLICATION_APPROVED',
        targetId: application.id,
        reason: 'Verified',
      }),
    });
  });
});
