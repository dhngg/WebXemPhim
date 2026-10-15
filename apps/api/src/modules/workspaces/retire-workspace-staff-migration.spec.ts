import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/202610150026_retire_workspace_staff_runtime/migration.sql',
  ),
  'utf8',
);

describe('migration 026 retire workspace staff runtime (review-only)', () => {
  it('does not rewrite or delete historical data', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b|DROP\s+(TABLE|COLUMN|TYPE)|ALTER\s+TYPE/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
  });

  it('blocks new MANAGER/STAFF role assignment but not unrelated updates of legacy rows', () => {
    expect(sql).toContain(`NEW."role" IN ('MANAGER', 'STAFF')`);
    expect(sql).toContain(`TG_OP = 'INSERT' OR NEW."role" IS DISTINCT FROM OLD."role"`);
  });

  it('does NOT forbid deleting memberships (no DELETE guard on workspace_memberships)', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON "workspace_memberships"/);
    expect(sql).not.toMatch(/BEFORE[^;]*\bDELETE\b[^;]*ON "workspace_memberships"/i);
    expect(sql).not.toContain(`TG_OP = 'DELETE'`);
    expect(sql).not.toContain('no_hard_delete');
  });

  it('keeps the deposit invariants and restricts the actor to OWNER', () => {
    expect(sql).toContain('only the workspace OWNER can write deposit entries');
    expect(sql).toContain('deposit balance cannot be negative');
    expect(sql).toContain('a reversal must fully reverse');
    expect(sql).toContain(
      'only a REFUND can be recorded while the workspace or building is archived',
    );
  });

  it('notifies OWNER recipients only', () => {
    expect(sql).toMatch(/"workspace_manager_ids"[\s\S]*"role" = 'OWNER'/);
    expect(sql).not.toMatch(/"role" IN \('OWNER', 'MANAGER'\)/);
  });

  it('forbids new maintenance assignment in the DB and never rewrites the legacy value', () => {
    expect(sql).not.toMatch(/SET\s+"assignee_user_id"/i);
    expect(sql).toContain('maintenance_requests_v1_no_assignment_check');
    expect(sql).toContain('NEW."assignee_user_id" IS DISTINCT FROM OLD."assignee_user_id"');
    expect(sql).toContain('"maintenance_requests_v1_no_assignee_on_insert"');
    expect(sql).toContain('"maintenance_status_history_v1_assignee_guard"');
    expect(sql).toContain('r."assignee_user_id" = NEW."assignee_user_id"');
  });

  it('relaxes only the assignee requirement of the state CHECK and keeps the workflow', () => {
    expect(sql).toContain(
      `("status" = 'IN_PROGRESS' AND "resolved_at" IS NULL AND "closed_at" IS NULL)`,
    );
    expect(sql).toContain(`(OLD."status" = 'OPEN' AND NEW."status" = 'CANCELLED')`);
    expect(sql).toContain('an assigned maintenance request cannot be cancelled');
    expect(sql).toContain(`BTRIM("resolution_note") <> ''`);
  });
});
