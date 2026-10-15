import {
  DashboardBuildingNotFoundRepositoryError,
  type DashboardRepository,
} from './dashboard.repository';
import { currentPeriod, DashboardService } from './dashboard.service';

const raw = {
  rooms: { total: 3, vacant: 1, occupied: 2, unavailable: 0 },
  contracts: { active: 2, ended: 1, expiring: 1 },
  invoices: {
    draft: 1,
    issued: 2,
    issuedInPeriod: 2,
    billedInPeriod: '3000000',
    unpaid: 1,
    partiallyPaid: 1,
    paid: 0,
  },
  collected: '500000',
  outstanding: '2500000',
  overdueInvoices: 1,
  overdueOutstanding: '1000000',
  maintenance: { open: 1, inProgress: 0, resolved: 0, closed: 2, cancelled: 0 },
};

describe('DashboardService', () => {
  it('uses the Asia/Ho_Chi_Minh month for the default period', () => {
    expect(currentPeriod(new Date('2026-09-30T18:00:00Z'))).toBe('2026-10');
    expect(currentPeriod(new Date('2026-09-30T16:59:00Z'))).toBe('2026-09');
  });

  it('maps repository figures into the shared contract', async () => {
    const summarize = jest.fn().mockResolvedValue(raw);
    const service = new DashboardService({ summarize } as unknown as DashboardRepository);
    const result = await service.get('w', { period: '2026-10' });
    expect(summarize).toHaveBeenCalledWith('w', null, '2026-10');
    expect(result.contracts.expiringWithin30Days).toBe(1);
    expect(result.revenue.collected).toBe('500000');
    expect(result.receivables).toEqual({
      outstanding: '2500000',
      overdueInvoices: 1,
      overdueOutstanding: '1000000',
    });
    expect(result.maintenance.closed).toBe(2);
  });

  it('maps an unknown building to BUILDING_NOT_FOUND', async () => {
    const summarize = jest.fn().mockRejectedValue(new DashboardBuildingNotFoundRepositoryError());
    const service = new DashboardService({ summarize } as unknown as DashboardRepository);
    await expect(service.get('w', { buildingId: 'b' })).rejects.toMatchObject({
      code: 'BUILDING_NOT_FOUND',
    });
  });
});
