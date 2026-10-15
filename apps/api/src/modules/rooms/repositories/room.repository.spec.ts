import { Prisma } from '../../../generated/prisma/client';
import { BuildingArchivedRepositoryError } from '../../buildings/repositories/building.repository';
import {
  RoomArchivedRepositoryError,
  RoomImageOrderInvalidRepositoryError,
  RoomRepository,
} from './room.repository';

describe('RoomRepository', () => {
  const input = { code: 'P101', areaSqm: '25.50', monthlyRent: '3500000.00' };

  it('creates a room only after workspace/building scope and role checks', async () => {
    const created = { id: 'room-1' };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      room: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    const repository = new RoomRepository(prisma as never);

    await expect(repository.createRoom('workspace-1', 'user-1', 'building-1', input)).resolves.toBe(
      created,
    );
    expect(tx.room.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        buildingId: 'building-1',
        code: 'P101',
      }),
      include: expect.any(Object),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('blocks writes when the building is archived', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      room: { create: jest.fn() },
    };
    const repository = new RoomRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.createRoom('workspace-1', 'user-1', 'building-1', input),
    ).rejects.toBeInstanceOf(BuildingArchivedRepositoryError);
    expect(tx.room.create).not.toHaveBeenCalled();
  });

  it('scopes room list and detail reads to workspace and building', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new RoomRepository({ room: { findMany, findFirst } } as never);
    await repository.listRooms('workspace-1', 'building-1');
    await repository.detailRoom('workspace-1', 'building-1', 'room-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'workspace-1', buildingId: 'building-1' } }),
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'room-1', workspaceId: 'workspace-1', buildingId: 'building-1' },
      }),
    );
  });

  it('blocks updates to archived rooms', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      room: { updateMany: jest.fn() },
    };
    const repository = new RoomRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.updateRoom('workspace-1', 'user-1', 'building-1', 'room-1', { code: 'P102' }),
    ).rejects.toBeInstanceOf(RoomArchivedRepositoryError);
    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });

  it('assigns an amenity idempotently after checking the same workspace', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'VACANT' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      amenity: { findFirst: jest.fn().mockResolvedValue({ id: 'amenity-1' }) },
      roomAmenity: { upsert },
    };
    const repository = new RoomRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await repository.assignAmenity('workspace-1', 'user-1', 'building-1', 'room-1', 'amenity-1');
    expect(tx.amenity.findFirst).toHaveBeenCalledWith({
      where: { id: 'amenity-1', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { roomId_amenityId: { roomId: 'room-1', amenityId: 'amenity-1' } },
      create: { roomId: 'room-1', amenityId: 'amenity-1' },
      update: {},
    });
  });

  it('adds image metadata at the next order after locking the property scope and room', async () => {
    const image = { id: 'image-2', sortOrder: 2 };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'VACANT' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      roomImage: {
        findFirst: jest.fn().mockResolvedValue({ sortOrder: 1 }),
        create: jest.fn().mockResolvedValue(image),
      },
    };
    const repository = new RoomRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.addRoomImage('workspace-1', 'user-1', 'building-1', 'room-1', {
        url: 'https://cdn.example.com/room.jpg',
      }),
    ).resolves.toBe(image);
    expect(tx.roomImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        roomId: 'room-1',
        sortOrder: 2,
      }),
    });
  });

  it('rejects an incomplete image reorder without updating rows', async () => {
    const updateMany = jest.fn();
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'VACANT' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      roomImage: {
        findMany: jest.fn().mockResolvedValue([{ id: 'image-1' }, { id: 'image-2' }]),
        updateMany,
      },
    };
    const repository = new RoomRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.reorderRoomImages('workspace-1', 'user-1', 'building-1', 'room-1', {
        imageIds: ['image-1'],
      }),
    ).rejects.toBeInstanceOf(RoomImageOrderInvalidRepositoryError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('reorders every current image atomically', async () => {
    const ordered = [
      { id: 'image-2', sortOrder: 0 },
      { id: 'image-1', sortOrder: 1 },
    ];
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'VACANT' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      roomImage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'image-1' }, { id: 'image-2' }])
          .mockResolvedValueOnce(ordered),
        updateMany,
      },
    };
    const repository = new RoomRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.reorderRoomImages('workspace-1', 'user-1', 'building-1', 'room-1', {
        imageIds: ['image-2', 'image-1'],
      }),
    ).resolves.toBe(ordered);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'image-2', workspaceId: 'workspace-1', roomId: 'room-1' },
      data: { sortOrder: 0 },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'image-1', workspaceId: 'workspace-1', roomId: 'room-1' },
      data: { sortOrder: 1 },
    });
  });

  it('blocks image changes when the room is archived', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      roomImage: { create: jest.fn(), findFirst: jest.fn() },
    };
    const repository = new RoomRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.addRoomImage('workspace-1', 'user-1', 'building-1', 'room-1', {
        url: 'https://cdn.example.com/room.jpg',
      }),
    ).rejects.toBeInstanceOf(RoomArchivedRepositoryError);
    expect(tx.roomImage.create).not.toHaveBeenCalled();
  });

  it('scopes image reads to workspace, building and room', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new RoomRepository({ roomImage: { findMany } } as never);
    await repository.listRoomImages('workspace-1', 'building-1', 'room-1');
    expect(findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        roomId: 'room-1',
        room: { buildingId: 'building-1', workspaceId: 'workspace-1' },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  });
});
