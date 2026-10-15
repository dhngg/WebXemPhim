import { RoomHasActiveContractRepositoryError, RoomRepository } from './room.repository';
import { RoomService } from '../services/room.service';

const room = (id: string, status: string) => ({ id, status, amenities: [] });

describe('RoomRepository derived occupancy (no cron flips rooms.status)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T20:00:00.000Z')); // 2026-10-15 03:00 in Vietnam
  });
  afterEach(() => jest.useRealTimers());

  const repoWith = (rooms: object[], started: string[]) => {
    const contractFindMany = jest.fn().mockResolvedValue(started.map((roomId) => ({ roomId })));
    const prisma = {
      room: {
        findMany: jest.fn().mockResolvedValue(rooms),
        findFirst: jest.fn().mockResolvedValue(rooms[0] ?? null),
      },
      contract: { findMany: contractFindMany },
    };
    return { repository: new RoomRepository(prisma as never), contractFindMany };
  };

  it('shows a room as OCCUPIED from the day its ACTIVE contract starts although the stored flag is still VACANT', async () => {
    const { repository, contractFindMany } = repoWith(
      [room('r1', 'VACANT'), room('r2', 'VACANT')],
      ['r1'],
    );
    const result = await repository.listRooms('w', 'b');
    expect(result.map((r) => [r.id, r.status])).toEqual([
      ['r1', 'OCCUPIED'],
      ['r2', 'VACANT'],
    ]);
    expect(contractFindMany).toHaveBeenCalledWith({
      where: {
        roomId: { in: ['r1', 'r2'] },
        status: 'ACTIVE',
        startDate: { lte: new Date('2026-10-15T00:00:00.000Z') },
      },
      select: { roomId: true },
      distinct: ['roomId'],
    });
  });

  it('does not show a room whose contracts are all future or ended as OCCUPIED', async () => {
    const { repository } = repoWith([room('r1', 'OCCUPIED')], []);
    expect((await repository.detailRoom('w', 'b', 'r1'))!.status).toBe('VACANT');
  });

  it('keeps ARCHIVED and manual UNAVAILABLE rooms as they are when no contract is in effect', async () => {
    const { repository, contractFindMany } = repoWith(
      [room('r1', 'ARCHIVED'), room('r2', 'UNAVAILABLE')],
      [],
    );
    expect((await repository.listRooms('w', 'b')).map((r) => r.status)).toEqual([
      'ARCHIVED',
      'UNAVAILABLE',
    ]);
    expect(contractFindMany.mock.calls[0][0].where.roomId).toEqual({ in: ['r2'] });
  });

  it('does not query contracts for an empty list', async () => {
    const { repository, contractFindMany } = repoWith([], []);
    await repository.listRooms('w', 'b');
    expect(contractFindMany).not.toHaveBeenCalled();
  });
});

describe("RoomRepository status guard (hasn't to reach the trigger as HTTP 500)", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T20:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  const txWith = (roomStatus: string, contractCount: number) => ({
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ status: 'ACTIVE' }])
      .mockResolvedValueOnce([{ status: 'ACTIVE' }])
      .mockResolvedValueOnce([{ status: roomStatus }]),
    workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
    contract: {
      count: jest.fn().mockResolvedValue(contractCount),
      findMany: jest.fn().mockResolvedValue([]),
    },
    room: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: 'r', status: 'VACANT', amenities: [] }),
    },
  });
  const repoOf = (tx: object) =>
    new RoomRepository({ $transaction: jest.fn(async (op) => op(tx)) } as never);

  it('refuses UNAVAILABLE/VACANT on a room whose contract has started, without writing', async () => {
    const tx = txWith('VACANT', 1);
    await expect(
      repoOf(tx).updateRoom('w', 'o', 'b', 'r', { status: 'UNAVAILABLE' }),
    ).rejects.toBeInstanceOf(RoomHasActiveContractRepositoryError);
    expect(tx.contract.count).toHaveBeenCalledWith({
      where: {
        roomId: 'r',
        status: 'ACTIVE',
        startDate: { lte: new Date('2026-10-15T00:00:00.000Z') },
      },
    });
    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });

  it('allows the status change when only a future contract exists, and an unchanged status is a no-op', async () => {
    const free = txWith('VACANT', 0);
    await repoOf(free).updateRoom('w', 'o', 'b', 'r', { status: 'UNAVAILABLE' });
    expect(free.room.updateMany).toHaveBeenCalled();
    const same = txWith('VACANT', 1);
    await repoOf(same).updateRoom('w', 'o', 'b', 'r', { status: 'VACANT' });
    expect(same.contract.count).not.toHaveBeenCalled();
  });

  it('refuses to archive a room that still has any ACTIVE contract (future included)', async () => {
    const tx = txWith('VACANT', 1);
    await expect(repoOf(tx).archiveRoom('w', 'o', 'b', 'r')).rejects.toBeInstanceOf(
      RoomHasActiveContractRepositoryError,
    );
    expect(tx.contract.count).toHaveBeenCalledWith({ where: { roomId: 'r', status: 'ACTIVE' } });
    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });

  it('maps the database trigger message (a race past the up-front check) to the same domain error', async () => {
    const tx = txWith('OCCUPIED', 0);
    tx.room.updateMany.mockRejectedValue(
      new Error('room with a started active contract must remain occupied'),
    );
    await expect(
      repoOf(tx).updateRoom('w', 'o', 'b', 'r', { status: 'VACANT' }),
    ).rejects.toBeInstanceOf(RoomHasActiveContractRepositoryError);
    const arch = txWith('OCCUPIED', 0);
    arch.room.updateMany.mockRejectedValue(
      new Error('room with an active contract cannot be archived'),
    );
    await expect(repoOf(arch).archiveRoom('w', 'o', 'b', 'r')).rejects.toBeInstanceOf(
      RoomHasActiveContractRepositoryError,
    );
  });

  it('the service answers with ROOM_HAS_ACTIVE_CONTRACT (409), never a raw 500', async () => {
    const repository = {
      updateRoom: jest.fn().mockRejectedValue(new RoomHasActiveContractRepositoryError()),
    };
    await expect(
      new RoomService(repository as never).updateRoom('w', 'o', 'b', 'r', { status: 'VACANT' }),
    ).rejects.toMatchObject({ code: 'ROOM_HAS_ACTIVE_CONTRACT' });
  });
});
