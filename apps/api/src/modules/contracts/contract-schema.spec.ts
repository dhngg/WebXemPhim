import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('P06 contract migration', () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../prisma/migrations/202610140010_p06_rental_contracts/migration.sql',
    ),
    'utf8',
  );
  it('uses an inclusive PostgreSQL exclusion constraint for ACTIVE room periods', () => {
    expect(sql).toContain('EXCLUDE USING gist');
    expect(sql).toContain('daterange("start_date", "end_date", \'[]\') WITH &&');
    expect(sql).toContain('WHERE ("status" = \'ACTIVE\')');
  });
  it('keeps room, tenant and workspace ownership aligned and blocks hard delete', () => {
    expect(sql).toContain('FOREIGN KEY ("room_id", "workspace_id")');
    expect(sql).toContain('FOREIGN KEY ("tenant_id", "workspace_id")');
    expect(sql).toContain('contracts_prevent_hard_delete');
    expect(sql).toContain('rooms_protect_active_contract_state');
    expect(sql).toContain('buildings_protect_active_contract_archive');
  });
});
