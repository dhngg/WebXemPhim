import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('P02-01 workspace migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../prisma/migrations/202610140002_p02_workspace_membership_foundation/migration.sql',
    ),
    'utf8',
  );

  it('uses RESTRICT foreign keys and blocks workspace hard delete', () => {
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(2);
    expect(migration).toContain('CREATE TRIGGER "workspaces_no_hard_delete_trigger"');
    expect(migration).toContain("\"workspace_status\" AS ENUM ('ACTIVE', 'ARCHIVED')");
    expect(migration).toContain('CONSTRAINT "workspaces_archive_state_check"');
  });

  it('enforces no more and no fewer than one OWNER at commit', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "workspace_memberships_one_owner_per_workspace_key"',
    );
    expect(migration).toContain('WHERE "role" = \'OWNER\'');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "workspaces_exactly_one_owner_trigger"');
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "workspace_memberships_exactly_one_owner_trigger"',
    );
    expect(migration.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    expect(migration).toContain('workspace must have exactly one owner');
  });
});
