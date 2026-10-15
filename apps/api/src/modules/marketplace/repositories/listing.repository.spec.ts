import { Prisma } from '../../../generated/prisma/client';
import { ListingNotEligibleRepositoryError, ListingRepository } from './listing.repository';

describe('ListingRepository', () => {
  it('publishes an eligible VACANT room after database-backed scope checks', async () => {
    const listing = { id: 'listing-1', isPublished: true };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'VACANT' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      contract: { count: jest.fn().mockResolvedValue(0) },
      listing: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(listing),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    const repository = new ListingRepository(prisma as never);
    await expect(
      repository.setPublication('workspace-1', 'user-1', 'building-1', 'room-1', {
        published: true,
      }),
    ).resolves.toBe(listing);
    expect(tx.listing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        roomId: 'room-1',
        isPublished: true,
        publishedAt: expect.any(Date),
        unpublishedAt: null,
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('does not publish a room that is not VACANT', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'OCCUPIED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      listing: { findUnique: jest.fn(), create: jest.fn() },
    };
    const repository = new ListingRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.setPublication('workspace-1', 'user-1', 'building-1', 'room-1', {
        published: true,
      }),
    ).rejects.toBeInstanceOf(ListingNotEligibleRepositoryError);
    expect(tx.listing.create).not.toHaveBeenCalled();
  });

  it('keeps repeated publication requests idempotent', async () => {
    const listing = { id: 'listing-1', isPublished: true };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'VACANT' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      contract: { count: jest.fn().mockResolvedValue(0) },
      listing: {
        findUnique: jest.fn().mockResolvedValue(listing),
        update: jest.fn(),
      },
    };
    const repository = new ListingRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.setPublication('workspace-1', 'user-1', 'building-1', 'room-1', {
        published: true,
      }),
    ).resolves.toBe(listing);
    expect(tx.listing.update).not.toHaveBeenCalled();
  });

  it('applies public eligibility, price, location and every requested amenity filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new ListingRepository({
      listing: { findMany, count },
      $transaction: jest.fn(async (operations) => Promise.all(operations)),
    } as never);
    await repository.listPublic({
      city: 'Hồ Chí Minh',
      district: 'Quận 1',
      minPrice: '2000000',
      maxPrice: '5000000',
      amenityIds: ['amenity-1', 'amenity-2'],
      page: 2,
      limit: 10,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublished: true,
          room: expect.objectContaining({
            status: 'VACANT',
            workspace: { status: 'ACTIVE' },
            building: expect.objectContaining({ status: 'ACTIVE' }),
            contracts: { none: { status: 'ACTIVE', startDate: { lte: expect.any(Date) } } },
            monthlyRent: { gte: '2000000', lte: '5000000' },
          }),
          AND: [
            { room: { amenities: { some: { amenityId: 'amenity-1' } } } },
            { room: { amenities: { some: { amenityId: 'amenity-2' } } } },
          ],
        }),
        skip: 10,
        take: 10,
      }),
    );
  });

  it('uses the full eligibility predicate for public detail', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new ListingRepository({ listing: { findFirst } } as never);
    await repository.detailPublic('listing-1');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'listing-1',
          isPublished: true,
          NOT: { moderation: { is: { isHidden: true } } },
          room: {
            status: 'VACANT',
            workspace: { status: 'ACTIVE' },
            building: { status: 'ACTIVE' },
            contracts: { none: { status: 'ACTIVE', startDate: { lte: expect.any(Date) } } },
          },
        },
      }),
    );
  });

  it('refuses to publish a room whose tenant already moved in, even if the stored flag is still VACANT', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'VACANT' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      contract: { count: jest.fn().mockResolvedValue(1) },
      listing: { findUnique: jest.fn(), create: jest.fn() },
    };
    const repository = new ListingRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.setPublication('workspace-1', 'user-1', 'building-1', 'room-1', {
        published: true,
      }),
    ).rejects.toBeInstanceOf(ListingNotEligibleRepositoryError);
    expect(tx.contract.count).toHaveBeenCalledWith({
      where: { roomId: 'room-1', status: 'ACTIVE', startDate: { lte: expect.any(Date) } },
    });
    expect(tx.listing.create).not.toHaveBeenCalled();
  });
});
