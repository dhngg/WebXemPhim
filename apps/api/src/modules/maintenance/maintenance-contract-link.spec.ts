import { MaintenanceRepository } from './maintenance.repository';

const created = { id: 'm1', status: 'OPEN', priority: 'LOW', history: [] };
const makeTx = (contract: object | null) => ({
  $queryRaw: jest
    .fn()
    .mockResolvedValueOnce([{ status: 'ACTIVE' }]) // workspace
    .mockResolvedValueOnce([{ status: 'ACTIVE' }]) // building (manager scope)
    .mockResolvedValueOnce([{ status: 'ACTIVE' }]) // building (room check)
    .mockResolvedValueOnce([{ status: 'OCCUPIED' }]), // room
  workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
  contract: { findFirst: jest.fn().mockResolvedValue(contract) },
  maintenanceRequest: {
    create: jest.fn().mockResolvedValue(created),
    findUniqueOrThrow: jest.fn().mockResolvedValue(created),
  },
  maintenanceStatusHistory: { create: jest.fn() },
});
const repoOf = (tx: object) =>
  new MaintenanceRepository({ $transaction: (fn: (t: object) => unknown) => fn(tx) } as never);
const input = { roomId: 'r', title: 'Leak', description: 'Sink leaks', priority: 'LOW' as const };

describe('MaintenanceRepository.create (manager) with date-based contracts', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T20:00:00.000Z')); // 2026-10-15 03:00 in Vietnam
  });
  afterEach(() => jest.useRealTimers());

  it('links the contract in effect today and never a future follow-up contract of the same room', async () => {
    const tx = makeTx({ id: 'c-current', tenantId: 't-current' });
    await repoOf(tx).create('w', 'owner', 'b', input);
    expect(tx.contract.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w',
        roomId: 'r',
        status: 'ACTIVE',
        startDate: { lte: new Date('2026-10-15T00:00:00.000Z') },
      },
      select: { id: true, tenantId: true },
      orderBy: { startDate: 'desc' },
    });
    expect(tx.maintenanceRequest.create.mock.calls[0][0].data).toMatchObject({
      contractId: 'c-current',
      tenantId: 't-current',
    });
  });

  it('keeps the request unlinked when the room only has a future contract', async () => {
    const tx = makeTx(null);
    await repoOf(tx).create('w', 'owner', 'b', input);
    expect(tx.maintenanceRequest.create.mock.calls[0][0].data.contractId).toBeUndefined();
  });
});
