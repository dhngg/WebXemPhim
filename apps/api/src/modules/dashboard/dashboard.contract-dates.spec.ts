import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

type Call = { text: string };
function run(rows: Record<number, Record<string, unknown>> = {}) {
  const calls: Call[] = [];
  const $queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const index = calls.length;
    calls.push({ text: strings.join('?') });
    return Promise.resolve([rows[index] ?? {}]);
  });
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: object) => unknown) => fn({ $queryRaw })),
  };
  return { calls, repository: new DashboardRepository(prisma as never) };
}

describe('Dashboard separates lifecycle ACTIVE from contracts actually in effect', () => {
  it('derives room occupancy from started ACTIVE contracts, not from the stored flag or future contracts', async () => {
    const { calls, repository } = run();
    await repository.summarize('w', null, '2026-10');
    const rooms = calls[0]!.text;
    expect(rooms).toContain('"status" = \'ACTIVE\' AND c."start_date" <= ');
    expect(rooms).toContain('s."room_id" IS NOT NULL');
    expect(rooms).not.toContain('r."status" = \'OCCUPIED\'');
  });

  it('counts in-effect, upcoming and overdue contracts by date and keeps expiring to started contracts only', async () => {
    const { calls, repository } = run();
    await repository.summarize('w', null, '2026-10');
    const sql = calls[1]!.text;
    expect(sql).toContain('AS in_effect');
    expect(sql).toContain('c."start_date" > ');
    expect(sql).toContain('AS upcoming');
    expect(sql).toContain('c."end_date" < ');
    expect(sql).toContain('AS overdue');
    expect(sql).toMatch(/c\."start_date" <= [\s\S]*AS expiring/);
  });

  it('exposes the new counters through the service without renaming the existing ones', async () => {
    const { repository } = run({
      1: { active: 5n, ended: 2n, expiring: 1n, in_effect: 3n, upcoming: 1n, overdue: 1n },
    });
    const body = await new DashboardService(repository).get('w', { period: '2026-10' } as never);
    expect(body.contracts).toEqual({
      active: 5,
      ended: 2,
      expiringWithin30Days: 1,
      inEffect: 3,
      upcoming: 1,
      overdue: 1,
    });
    expect(body.contracts.active).toBe(
      body.contracts.inEffect + body.contracts.upcoming + body.contracts.overdue,
    );
  });
});
