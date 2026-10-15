import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
describe('P07 building rate migration', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../prisma/migrations/202610140012_p07_building_rates/migration.sql'),
    'utf8',
  );
  it('uses Decimal and non-overlapping half-open effective periods', () => {
    expect(sql).toContain('DECIMAL(14,4)');
    expect(sql).toContain('EXCLUDE USING gist');
    expect(sql).toContain("'[)'");
    expect(sql).toContain('rate_plans_period_excl');
  });
  it('preserves scope and immutable history', () => {
    expect(sql).toContain('FOREIGN KEY ("building_id", "workspace_id")');
    expect(sql).toContain('rate_plans_prevent_hard_delete');
  });
});
