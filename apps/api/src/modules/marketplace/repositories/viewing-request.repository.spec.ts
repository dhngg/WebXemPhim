import { Prisma } from '../../../generated/prisma/client';
import {
  ViewingRequestInvalidTransitionRepositoryError,
  ViewingRequestNotEligibleRepositoryError,
  ViewingRequestNotFoundRepositoryError,
  ViewingRequestRepository,
} from './viewing-request.repository';

describe('ViewingRequestRepository', () => {
  const future = '2099-10-20T03:00:00.000Z';

  it('creates a request only from a currently eligible public listing', async () => {
    const created = { id: 'request-1' };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'listing-1' }]),
      listing: {
        findFirst: jest.fn().mockResolvedValue({ id: 'listing-1', workspaceId: 'workspace-1' }),
      },
      viewingRequest: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    const repository = new ViewingRequestRepository(prisma as never);
    await expect(
      repository.create('user-1', 'listing-1', { scheduledAt: future, message: 'Buổi sáng' }),
    ).resolves.toBe(created);
    expect(tx.listing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'listing-1',
          isPublished: true,
          room: {
            status: 'VACANT',
            workspace: { status: 'ACTIVE' },
            building: { status: 'ACTIVE' },
            contracts: { none: { status: 'ACTIVE', startDate: { lte: expect.any(Date) } } },
          },
        }),
      }),
    );
    expect(tx.viewingRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          requesterUserId: 'user-1',
          listingId: 'listing-1',
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects a schedule that is not in the future before writing', async () => {
    const tx = { $queryRaw: jest.fn(), viewingRequest: { create: jest.fn() } };
    const repository = new ViewingRequestRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.create('user-1', 'listing-1', { scheduledAt: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ViewingRequestNotEligibleRepositoryError);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.viewingRequest.create).not.toHaveBeenCalled();
  });

  it('scopes customer cancellation by both request and requester IDs', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      viewingRequest: { update: jest.fn() },
    };
    const repository = new ViewingRequestRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(repository.cancel('user-1', 'request-1')).rejects.toBeInstanceOf(
      ViewingRequestNotFoundRepositoryError,
    );
    expect(tx.viewingRequest.update).not.toHaveBeenCalled();
  });

  it('does not allow cancelling a terminal request', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'REJECTED' }]),
      viewingRequest: { update: jest.fn() },
    };
    const repository = new ViewingRequestRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(repository.cancel('user-1', 'request-1')).rejects.toBeInstanceOf(
      ViewingRequestInvalidTransitionRepositoryError,
    );
    expect(tx.viewingRequest.update).not.toHaveBeenCalled();
  });

  it('confirms a pending request only after workspace role and listing eligibility checks', async () => {
    const record = { id: 'request-1', status: 'CONFIRMED' };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([
          { status: 'PENDING', listingId: 'listing-1', scheduledAt: new Date(future) },
        ]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      listing: { findFirst: jest.fn().mockResolvedValue({ id: 'listing-1' }) },
      viewingRequest: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(record),
      },
    };
    const repository = new ViewingRequestRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.decide('workspace-1', 'manager-1', 'request-1', 'CONFIRMED', {}),
    ).resolves.toBe(record);
    expect(tx.listing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'workspace-1', isPublished: true }),
      }),
    );
    expect(tx.viewingRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        decidedByUserId: 'manager-1',
        decidedAt: expect.any(Date),
      }),
    });
  });

  it('scopes customer and workspace lists independently', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new ViewingRequestRepository({
      viewingRequest: { findMany, count },
      $transaction: jest.fn(async (operations) => Promise.all(operations)),
    } as never);
    await repository.listMine('user-1', { status: 'PENDING', page: 1, limit: 20 });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { requesterUserId: 'user-1', status: 'PENDING' } }),
    );
    await repository.listWorkspace('workspace-1', { page: 1, limit: 20 });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { workspaceId: 'workspace-1', status: undefined } }),
    );
  });
});
