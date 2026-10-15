import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
describe('P06 vehicle migration', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../prisma/migrations/202610140011_p06_vehicle_management/migration.sql',
    ),
    'utf8',
  );
  it('normalizes and uniquely scopes license plates to a workspace', () => {
    expect(sql).toContain('UNIQUE ("workspace_id", "license_plate")');
    expect(sql).toContain('"license_plate" = UPPER("license_plate")');
  });
  it('preserves workspace/tenant scope and blocks hard delete', () => {
    expect(sql).toContain('FOREIGN KEY ("tenant_id", "workspace_id")');
    expect(sql).toContain('vehicles_prevent_hard_delete');
  });
});
