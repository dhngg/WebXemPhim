import { isCancelledBeforeStart } from '@rental/shared';
import { Prisma } from '../../../generated/prisma/client';
import {
  ContractConflictRepositoryError,
  ContractEndDateRequiredRepositoryError,
  ContractInvalidTransitionRepositoryError,
  ContractNotEligibleRepositoryError,
  ContractRepository,
} from './contract.repository';

// Business "today" is 2026-10-15 in Asia/Ho_Chi_Minh. 2026-10-14T20:00Z is already 03:00 on the 15th in Vietnam.
const NOW_VN_0300 = new Date('2026-10-14T20:00:00.000Z');
const D = (value: string) => new Date(`${value}T00:00:00.000Z`);

interface TxOptions {
  roomStatus?: string;
  buildingStatus?: string;
  contract?: { status: string; roomId?: string; startDate: Date; endDate: Date };
  startedElsewhere?: number;
}
function makeTx(options: TxOptions = {}) {
  const queue: unknown[][] = [[{ status: 'ACTIVE' }]]; // workspace
  if (options.contract) queue.push([{ roomId: 'room-1', ...options.contract }]); // lockContract
  queue.push([
    { status: options.roomStatus ?? 'VACANT', buildingStatus: options.buildingStatus ?? 'ACTIVE' },
  ]); // lockRoom
  const $queryRaw = jest.fn();
  for (const rows of queue) $queryRaw.mockResolvedValueOnce(rows);
  return {
    $queryRaw,
    workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
    contract: {
      create: jest.fn().mockResolvedValue({ id: 'contract-1' }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'contract-1', ...data })),
      count: jest.fn().mockResolvedValue(options.startedElsewhere ?? 0),
    },
    room: { update: jest.fn().mockResolvedValue({}) },
  };
}
const repositoryFor = (tx: ReturnType<typeof makeTx>) => {
  const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
  return { prisma, repository: new ContractRepository(prisma as never) };
};

describe('ContractRepository', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW_VN_0300);
  });
  afterEach(() => jest.useRealTimers());

  const input = {
    roomId: 'room-1',
    tenantId: 'tenant-1',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    monthlyRent: '3500000.00',
  };

  describe('create', () => {
    it('creates a contract that already started and marks the locked VACANT room OCCUPIED atomically', async () => {
      const tx = makeTx();
      const { prisma, repository } = repositoryFor(tx);
      await expect(repository.create('workspace-1', 'owner-1', input)).resolves.toEqual({
        id: 'contract-1',
      });
      expect(tx.contract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'workspace-1',
            roomId: 'room-1',
            tenantId: 'tenant-1',
          }),
        }),
      );
      expect(tx.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'OCCUPIED' },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    });

    it('creates a future-start contract WITHOUT occupying the room', async () => {
      const tx = makeTx();
      const { repository } = repositoryFor(tx);
      await repository.create('workspace-1', 'owner-1', {
        ...input,
        startDate: '2026-11-01',
        endDate: '2027-10-31',
      });
      expect(tx.contract.create).toHaveBeenCalled();
      expect(tx.room.update).not.toHaveBeenCalled();
    });

    it('treats a contract starting today (Vietnam date, 03:00 local = still yesterday in UTC) as started', async () => {
      const tx = makeTx();
      const { repository } = repositoryFor(tx);
      await repository.create('workspace-1', 'owner-1', {
        ...input,
        startDate: '2026-10-15',
        endDate: '2026-12-31',
      });
      expect(tx.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'OCCUPIED' },
      });
    });

    it('chains a follow-up contract on a room that is already OCCUPIED, without touching the room status', async () => {
      const tx = makeTx({ roomStatus: 'OCCUPIED' });
      const { repository } = repositoryFor(tx);
      await repository.create('workspace-1', 'owner-1', {
        ...input,
        startDate: '2026-11-01',
        endDate: '2027-10-31',
      });
      expect(tx.contract.create).toHaveBeenCalled();
      expect(tx.room.update).not.toHaveBeenCalled();
    });

    it.each(['UNAVAILABLE'])('still refuses a %s room', async (roomStatus) => {
      const tx = makeTx({ roomStatus });
      const { repository } = repositoryFor(tx);
      await expect(repository.create('workspace-1', 'owner-1', input)).rejects.toBeInstanceOf(
        ContractNotEligibleRepositoryError,
      );
      expect(tx.contract.create).not.toHaveBeenCalled();
    });

    it('refuses an archived building and an unknown/archived tenant', async () => {
      const tx = makeTx({ buildingStatus: 'ARCHIVED' });
      await expect(
        repositoryFor(tx).repository.create('workspace-1', 'owner-1', input),
      ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
      const tx2 = makeTx();
      tx2.tenant.findFirst.mockResolvedValue(null);
      await expect(
        repositoryFor(tx2).repository.create('workspace-1', 'owner-1', input),
      ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
    });

    it('maps the PostgreSQL exclusion violation (overlapping dates, incl. a concurrent request) to CONTRACT_CONFLICT', async () => {
      const tx = makeTx();
      tx.contract.create.mockRejectedValue(
        Object.assign(
          new Error(
            'conflicting key value violates exclusion constraint "contracts_active_room_period_excl"',
          ),
          { meta: { code: '23P01' } },
        ),
      );
      await expect(
        repositoryFor(tx).repository.create('workspace-1', 'owner-1', input),
      ).rejects.toBeInstanceOf(ContractConflictRepositoryError);
    });

    it('retries a serialization failure and then returns the committed winner as a conflict', async () => {
      const failure = Object.assign(new Error('could not serialize access'), { code: 'P2034' });
      const prisma = { $transaction: jest.fn().mockRejectedValue(failure) };
      const repository = new ContractRepository(prisma as never);
      await expect(repository.create('workspace-1', 'owner-1', input)).rejects.toBeInstanceOf(
        ContractConflictRepositoryError,
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('succeeds when the first attempt hits a serialization failure and the retry is clean', async () => {
      const failure = Object.assign(new Error('could not serialize access'), { code: 'P2034' });
      const tx = makeTx();
      const prisma = {
        $transaction: jest
          .fn()
          .mockRejectedValueOnce(failure)
          .mockImplementationOnce(async (op) => op(tx)),
      };
      await expect(
        new ContractRepository(prisma as never).create('workspace-1', 'owner-1', input),
      ).resolves.toEqual({ id: 'contract-1' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('list and detail', () => {
    it('scopes list and detail reads to workspace', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const findFirst = jest.fn().mockResolvedValue(null);
      const repository = new ContractRepository({
        contract: { findMany, count, findFirst },
        $transaction: jest.fn(async (ops) => Promise.all(ops)),
      } as never);
      await repository.list('workspace-1', { status: 'ACTIVE', page: 2, limit: 10 });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'workspace-1', status: 'ACTIVE' },
          skip: 10,
          take: 10,
        }),
      );
      await repository.detail('workspace-1', 'contract-1');
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'contract-1', workspaceId: 'workspace-1' } }),
      );
    });

    it('scopes tenant contract lists and details to active links of the authenticated user (future contracts included)', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const findFirst = jest.fn().mockResolvedValue(null);
      const prisma = {
        contract: { findMany, count, findFirst },
        $transaction: jest.fn(async (ops) => Promise.all(ops)),
      };
      const repository = new ContractRepository(prisma as never);
      await repository.listForTenantUser('tenant-user', { status: 'ENDED', page: 2, limit: 10 });
      const where = {
        status: 'ENDED',
        tenant: { userLinks: { some: { userId: 'tenant-user', revokedAt: null } } },
      };
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10 }));
      expect(count).toHaveBeenCalledWith({ where });
      await repository.detailForTenantUser('tenant-user', 'contract-1');
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'contract-1',
            tenant: { userLinks: { some: { userId: 'tenant-user', revokedAt: null } } },
          },
        }),
      );
      // No date/phase predicate: before startDate the tenant can still see the contract.
      expect(JSON.stringify(findFirst.mock.calls[0][0].where)).not.toContain('startDate');
    });
  });

  describe('update', () => {
    const active = (start: string, end: string) => ({
      status: 'ACTIVE',
      startDate: D(start),
      endDate: D(end),
    });

    it('lets the OWNER edit a future contract and move its start further into the future', async () => {
      const tx = makeTx({ contract: active('2026-11-01', '2027-10-31') });
      await repositoryFor(tx).repository.update('workspace-1', 'owner-1', 'contract-1', {
        startDate: '2026-12-01',
      });
      expect(tx.contract.update).toHaveBeenCalled();
      expect(tx.room.update).not.toHaveBeenCalled();
    });

    it('occupies a VACANT room when a future contract is edited to start today', async () => {
      const tx = makeTx({ contract: active('2026-11-01', '2027-10-31') });
      await repositoryFor(tx).repository.update('workspace-1', 'owner-1', 'contract-1', {
        startDate: '2026-10-15',
      });
      expect(tx.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'OCCUPIED' },
      });
    });

    it('does not push an already started contract back into the future', async () => {
      const tx = makeTx({ contract: active('2026-10-01', '2027-09-30') });
      await expect(
        repositoryFor(tx).repository.update('workspace-1', 'owner-1', 'contract-1', {
          startDate: '2026-10-16',
        }),
      ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
      expect(tx.contract.update).not.toHaveBeenCalled();
    });

    it('keeps refusing an end before today or before the start, and a non-ACTIVE contract', async () => {
      await expect(
        repositoryFor(makeTx({ contract: active('2026-10-01', '2027-09-30') })).repository.update(
          'workspace-1',
          'owner-1',
          'contract-1',
          { endDate: '2026-10-14' },
        ),
      ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
      await expect(
        repositoryFor(makeTx({ contract: active('2026-11-01', '2027-10-31') })).repository.update(
          'workspace-1',
          'owner-1',
          'contract-1',
          { endDate: '2026-10-31' },
        ),
      ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
      await expect(
        repositoryFor(
          makeTx({
            contract: { status: 'ENDED', startDate: D('2026-01-01'), endDate: D('2026-02-01') },
          }),
        ).repository.update('workspace-1', 'owner-1', 'contract-1', { notes: 'x' }),
      ).rejects.toBeInstanceOf(ContractInvalidTransitionRepositoryError);
    });
  });

  describe('end / cancel', () => {
    const active = (start: string, end: string) => ({
      status: 'ACTIVE',
      startDate: D(start),
      endDate: D(end),
    });

    it('ends a started contract with its effective last day and returns the OCCUPIED room to VACANT when nothing else is in effect', async () => {
      const tx = makeTx({ roomStatus: 'OCCUPIED', contract: active('2026-10-01', '2026-10-31') });
      await repositoryFor(tx).repository.end('workspace-1', 'owner-1', 'contract-1', {
        endDate: '2026-10-14',
      });
      expect(tx.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ENDED',
            endDate: D('2026-10-14'),
            endedByUserId: 'owner-1',
          }),
        }),
      );
      expect(tx.contract.count).toHaveBeenCalledWith({
        where: { roomId: 'room-1', status: 'ACTIVE', startDate: { lte: D('2026-10-15') } },
      });
      expect(tx.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'VACANT' },
      });
    });

    it('does NOT vacate the room while another contract of it is already in effect', async () => {
      const tx = makeTx({
        roomStatus: 'OCCUPIED',
        contract: active('2026-10-01', '2026-10-10'),
        startedElsewhere: 1,
      });
      await repositoryFor(tx).repository.end('workspace-1', 'owner-1', 'contract-1', {
        endDate: '2026-10-10',
      });
      expect(tx.room.update).not.toHaveBeenCalled();
    });

    it('ends the current contract while a future follow-up stays reserved (room goes VACANT until it starts)', async () => {
      const tx = makeTx({
        roomStatus: 'OCCUPIED',
        contract: active('2026-10-01', '2026-10-31'),
        startedElsewhere: 0,
      });
      await repositoryFor(tx).repository.end('workspace-1', 'owner-1', 'contract-1', {
        endDate: '2026-10-15',
      });
      expect(tx.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'VACANT' },
      });
    });

    it('accepts the inclusive boundaries: effective end = startDate and effective end = today', async () => {
      await repositoryFor(
        makeTx({ roomStatus: 'OCCUPIED', contract: active('2026-10-15', '2026-12-31') }),
      ).repository.end('workspace-1', 'owner-1', 'contract-1', { endDate: '2026-10-15' });
      await repositoryFor(
        makeTx({ roomStatus: 'OCCUPIED', contract: active('2026-10-01', '2026-12-31') }),
      ).repository.end('workspace-1', 'owner-1', 'contract-1', { endDate: '2026-10-15' });
    });

    it('refuses an effective end before startDate or after today for a started contract', async () => {
      await expect(
        repositoryFor(makeTx({ contract: active('2026-10-10', '2026-12-31') })).repository.end(
          'workspace-1',
          'owner-1',
          'contract-1',
          { endDate: '2026-10-09' },
        ),
      ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
      await expect(
        repositoryFor(makeTx({ contract: active('2026-10-10', '2026-12-31') })).repository.end(
          'workspace-1',
          'owner-1',
          'contract-1',
          { endDate: '2026-10-16' },
        ),
      ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
    });

    it('requires the effective end for a started contract', async () => {
      await expect(
        repositoryFor(makeTx({ contract: active('2026-10-01', '2026-12-31') })).repository.end(
          'workspace-1',
          'owner-1',
          'contract-1',
          {},
        ),
      ).rejects.toBeInstanceOf(ContractEndDateRequiredRepositoryError);
    });

    it('cancels a contract that has not started: ENDED, registered period and room untouched, history kept', async () => {
      const tx = makeTx({ roomStatus: 'OCCUPIED', contract: active('2026-11-01', '2027-10-31') });
      await repositoryFor(tx).repository.end('workspace-1', 'owner-1', 'contract-1', {});
      const data = tx.contract.update.mock.calls[0][0].data;
      expect(data).toEqual({
        status: 'ENDED',
        endedAt: expect.any(Date),
        endedByUserId: 'owner-1',
      });
      expect(data).not.toHaveProperty('endDate'); // no fake one-day period
      expect(data).not.toHaveProperty('startDate');
      expect(tx.room.update).not.toHaveBeenCalled();
      expect(tx.contract.count).not.toHaveBeenCalled();
    });

    it('refuses an endDate when cancelling a contract that has not started', async () => {
      const tx = makeTx({ contract: active('2026-11-01', '2027-10-31') });
      await expect(
        repositoryFor(tx).repository.end('workspace-1', 'owner-1', 'contract-1', {
          endDate: '2026-11-01',
        }),
      ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
      expect(tx.contract.update).not.toHaveBeenCalled();
    });

    it('does not end an already ENDED contract', async () => {
      const tx = makeTx({
        contract: { status: 'ENDED', startDate: D('2026-01-01'), endDate: D('2026-02-01') },
      });
      await expect(
        repositoryFor(tx).repository.end('workspace-1', 'owner-1', 'contract-1', {
          endDate: '2026-10-14',
        }),
      ).rejects.toBeInstanceOf(ContractInvalidTransitionRepositoryError);
    });

    it('rejects a non-OWNER before touching any contract data', async () => {
      const tx = makeTx({ contract: active('2026-10-01', '2026-12-31') });
      tx.workspaceMembership.findUnique.mockResolvedValue({ role: 'MANAGER' });
      await expect(
        repositoryFor(tx).repository.end('workspace-1', 'x', 'contract-1', {
          endDate: '2026-10-14',
        }),
      ).rejects.toThrow();
      expect(tx.contract.update).not.toHaveBeenCalled();
    });
  });
});

describe('ContractRepository clock boundaries (Asia/Ho_Chi_Minh midnight)', () => {
  afterEach(() => jest.useRealTimers());
  const at = (iso: string) => jest.useFakeTimers().setSystemTime(new Date(iso));
  const input = { roomId: 'room-1', tenantId: 'tenant-1', monthlyRent: '1.00' };
  const active = (start: string, end: string) => ({
    status: 'ACTIVE',
    startDate: D(start),
    endDate: D(end),
  });

  it('re-validates the period inside the transaction: an end date that became yesterday at midnight is refused', async () => {
    // 2026-10-14T17:00Z is 2026-10-15 00:00 in Vietnam: endDate 2026-10-14 is now in the past.
    at('2026-10-14T17:00:00.000Z');
    const tx = makeTx();
    await expect(
      repositoryFor(tx).repository.create('w', 'o', {
        ...input,
        startDate: '2026-10-01',
        endDate: '2026-10-14',
      }),
    ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
    expect(tx.contract.create).not.toHaveBeenCalled();
    // one second earlier it is still the 14th in Vietnam and the same period is valid
    at('2026-10-14T16:59:59.999Z');
    const tx2 = makeTx();
    await repositoryFor(tx2).repository.create('w', 'o', {
      ...input,
      startDate: '2026-10-01',
      endDate: '2026-10-14',
    });
    expect(tx2.contract.create).toHaveBeenCalled();
  });

  it('a contract starting on the new Vietnam day is "started" exactly at 00:00 and not one second before', async () => {
    at('2026-10-14T16:59:59.999Z');
    const before = makeTx();
    await repositoryFor(before).repository.create('w', 'o', {
      ...input,
      startDate: '2026-10-15',
      endDate: '2026-12-31',
    });
    expect(before.room.update).not.toHaveBeenCalled();
    at('2026-10-14T17:00:00.000Z');
    const after = makeTx();
    await repositoryFor(after).repository.create('w', 'o', {
      ...input,
      startDate: '2026-10-15',
      endDate: '2026-12-31',
    });
    expect(after.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { status: 'OCCUPIED' },
    });
  });

  it('end uses ONE instant for the business date, the validation and endedAt (cancel and normal end)', async () => {
    at('2026-10-14T17:00:00.000Z'); // 2026-10-15 00:00 VN
    const cancel = makeTx({ contract: active('2026-10-16', '2026-12-31') });
    await repositoryFor(cancel).repository.end('w', 'o', 'c', {});
    expect(cancel.contract.update.mock.calls[0][0].data.endedAt).toEqual(
      new Date('2026-10-14T17:00:00.000Z'),
    );
    const normal = makeTx({ roomStatus: 'OCCUPIED', contract: active('2026-10-15', '2026-12-31') });
    await repositoryFor(normal).repository.end('w', 'o', 'c', { endDate: '2026-10-15' });
    expect(normal.contract.update.mock.calls[0][0].data.endedAt).toEqual(
      new Date('2026-10-14T17:00:00.000Z'),
    );
    // 2026-10-15 is "today" now, so it is a valid effective end; one second earlier it would be in the future
    at('2026-10-14T16:59:59.999Z');
    await expect(
      repositoryFor(makeTx({ contract: active('2026-10-10', '2026-12-31') })).repository.end(
        'w',
        'o',
        'c',
        { endDate: '2026-10-15' },
      ),
    ).rejects.toBeInstanceOf(ContractNotEligibleRepositoryError);
  });

  it('a cancellation is classified as cancelled by the same instant that decided it', async () => {
    at('2026-10-14T16:59:59.999Z'); // still 14th; contract starts on the 15th => not started => cancel
    const tx = makeTx({ contract: active('2026-10-15', '2026-12-31') });
    await repositoryFor(tx).repository.end('w', 'o', 'c', {});
    const endedAt = tx.contract.update.mock.calls[0][0].data.endedAt as Date;
    expect(isCancelledBeforeStart({ status: 'ENDED', startDate: '2026-10-15', endedAt })).toBe(
      true,
    );
  });
});
