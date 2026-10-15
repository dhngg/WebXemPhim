-- Approved by the product owner (BE-V1-RBAC-03).
-- Preserve every historical membership while preventing V1 from creating or
-- reassigning MANAGER/STAFF roles through SQL outside the application.

BEGIN;

-- Membership policy (V1): historical rows are kept untouched and may still be deleted by
-- existing operations; only NEW MANAGER/STAFF rows or a role change INTO MANAGER/STAFF is refused.
CREATE OR REPLACE FUNCTION "guard_v1_workspace_membership_role"()
RETURNS trigger AS $$
BEGIN
  IF NEW."role" IN ('MANAGER', 'STAFF')
     AND (TG_OP = 'INSERT' OR NEW."role" IS DISTINCT FROM OLD."role") THEN
    RAISE EXCEPTION 'MANAGER and STAFF memberships are retired in V1'
      USING ERRCODE = '23514',
            CONSTRAINT = 'workspace_memberships_v1_owner_only_check';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "workspace_memberships_v1_role_guard"
BEFORE INSERT OR UPDATE ON "workspace_memberships"
FOR EACH ROW EXECUTE FUNCTION "guard_v1_workspace_membership_role"();

-- Keep all financial invariants from migration 018, changing only the actor
-- authorization from OWNER/MANAGER to OWNER.
CREATE OR REPLACE FUNCTION "guard_contract_deposit_insert"()
RETURNS trigger AS $$
DECLARE
  orig_kind "deposit_entry_kind";
  orig_amount NUMERIC;
  orig_method "payment_method";
  effect NUMERIC;
  actor_role TEXT;
BEGIN
  PERFORM 1 FROM "contracts" WHERE "id" = NEW."contract_id" AND "workspace_id" = NEW."workspace_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit entries require an existing contract of the workspace';
  END IF;

  SELECT m."role"::text INTO actor_role FROM "workspace_memberships" m
    WHERE m."workspace_id" = NEW."workspace_id" AND m."user_id" = NEW."created_by";
  IF actor_role IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'only the workspace OWNER can write deposit entries';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "workspaces" w WHERE w."id" = NEW."workspace_id" AND w."status"::text <> 'ACTIVE'
  ) OR EXISTS (
    SELECT 1 FROM "contracts" c
      JOIN "rooms" r ON r."id" = c."room_id"
      JOIN "buildings" b ON b."id" = r."building_id"
      WHERE c."id" = NEW."contract_id" AND b."status"::text <> 'ACTIVE'
  ) THEN
    IF NEW."kind" <> 'REFUND' THEN
      RAISE EXCEPTION 'only a REFUND can be recorded while the workspace or building is archived';
    END IF;
  END IF;

  IF NEW."kind" = 'REVERSAL' THEN
    SELECT "kind", "amount", "method" INTO orig_kind, orig_amount, orig_method
      FROM "contract_deposit_entries" WHERE "id" = NEW."reverses_entry_id" AND "contract_id" = NEW."contract_id";
    IF orig_kind IS NULL OR orig_kind = 'REVERSAL' OR orig_amount <> NEW."amount"
       OR orig_method IS DISTINCT FROM NEW."method" THEN
      RAISE EXCEPTION 'a reversal must fully reverse a collection, deduction or refund of the same contract';
    END IF;
    effect := CASE WHEN orig_kind = 'COLLECTION' THEN -NEW."amount" ELSE NEW."amount" END;
  ELSE
    effect := CASE WHEN NEW."kind" = 'COLLECTION' THEN NEW."amount" ELSE -NEW."amount" END;
  END IF;

  IF "contract_deposit_balance"(NEW."contract_id") + effect < 0 THEN
    RAISE EXCEPTION 'deposit balance cannot be negative';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Keep the legacy function name so existing notification triggers continue to
-- work, but return OWNER recipients only in V1.
CREATE OR REPLACE FUNCTION "workspace_manager_ids"(p_workspace_id UUID)
RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg("user_id"), ARRAY[]::UUID[]) FROM "workspace_memberships"
  WHERE "workspace_id" = p_workspace_id AND "role" = 'OWNER'
$$;

-- Maintenance policy (V1): there is no assignee feature; the OWNER handles requests directly.
-- Existing assignments are history: they are never rewritten, cleared or backfilled, and no new
-- assignment (or reassignment) can be made.
--
-- DECISION REQUIRED AT REVIEW: the state CHECK from 019/023 demands a non-NULL assignee for
-- IN_PROGRESS and RESOLVED. Without relaxing it the OWNER could not move a request forward at all
-- once assignment is forbidden. The CHECK below only REMOVES that requirement (every existing row
-- already satisfies it) and leaves every other predicate and the OPEN -> IN_PROGRESS -> RESOLVED ->
-- CLOSED / OPEN -> CANCELLED workflow unchanged.
ALTER TABLE "maintenance_requests" DROP CONSTRAINT "maintenance_requests_state_check";
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_state_check" CHECK (
  ("status" = 'OPEN' AND "resolved_at" IS NULL AND "closed_at" IS NULL)
  OR ("status" = 'IN_PROGRESS' AND "resolved_at" IS NULL AND "closed_at" IS NULL)
  OR ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "closed_at" IS NULL
      AND "resolution_note" IS NOT NULL AND BTRIM("resolution_note") <> '')
  OR ("status" = 'CLOSED' AND "resolved_at" IS NOT NULL AND "closed_at" IS NOT NULL
      AND "resolution_note" IS NOT NULL AND BTRIM("resolution_note") <> '')
  OR ("status" = 'CANCELLED' AND "assignee_user_id" IS NULL AND "resolved_at" IS NULL AND "closed_at" IS NULL)
);

-- Same as 023 except the "assignee must be a workspace member" rule is replaced by "assignee never
-- changes" (legacy assignee values stay exactly as they are).
CREATE OR REPLACE FUNCTION "guard_maintenance_request_update"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('CLOSED', 'CANCELLED') THEN
    RAISE EXCEPTION 'closed or cancelled maintenance requests are immutable';
  END IF;
  IF NEW."workspace_id" <> OLD."workspace_id" OR NEW."building_id" <> OLD."building_id"
     OR NEW."room_id" <> OLD."room_id" OR NEW."requested_by" <> OLD."requested_by"
     OR NEW."contract_id" IS DISTINCT FROM OLD."contract_id"
     OR NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN
    RAISE EXCEPTION 'maintenance request scope and requester cannot change';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'OPEN' AND NEW."status" = 'IN_PROGRESS')
    OR (OLD."status" = 'IN_PROGRESS' AND NEW."status" = 'RESOLVED')
    OR (OLD."status" = 'RESOLVED' AND NEW."status" = 'CLOSED')
    OR (OLD."status" = 'OPEN' AND NEW."status" = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'invalid maintenance status transition % -> %', OLD."status", NEW."status";
  END IF;
  IF NEW."status" = 'CANCELLED' AND OLD."assignee_user_id" IS NOT NULL THEN
    RAISE EXCEPTION 'an assigned maintenance request cannot be cancelled';
  END IF;
  IF NEW."assignee_user_id" IS DISTINCT FROM OLD."assignee_user_id" THEN
    RAISE EXCEPTION 'maintenance assignment is retired in V1; the assignee cannot change'
      USING ERRCODE = '23514',
            CONSTRAINT = 'maintenance_requests_v1_no_assignment_check';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- New requests never start with an assignee.
CREATE OR REPLACE FUNCTION "guard_v1_maintenance_no_assignee_on_insert"()
RETURNS trigger AS $$
BEGIN
  IF NEW."assignee_user_id" IS NOT NULL THEN
    RAISE EXCEPTION 'maintenance assignment is retired in V1; the assignee must be empty'
      USING ERRCODE = '23514',
            CONSTRAINT = 'maintenance_requests_v1_no_assignment_check';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "maintenance_requests_v1_no_assignee_on_insert"
BEFORE INSERT ON "maintenance_requests"
FOR EACH ROW EXECUTE FUNCTION "guard_v1_maintenance_no_assignee_on_insert"();

-- History rows may only carry the request's own (legacy) assignee, never a new one.
CREATE OR REPLACE FUNCTION "guard_v1_maintenance_history_assignee"()
RETURNS trigger AS $$
BEGIN
  IF NEW."assignee_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "maintenance_requests" r
    WHERE r."id" = NEW."request_id" AND r."assignee_user_id" = NEW."assignee_user_id"
  ) THEN
    RAISE EXCEPTION 'maintenance assignment is retired in V1; history cannot record a new assignee'
      USING ERRCODE = '23514',
            CONSTRAINT = 'maintenance_status_history_v1_no_assignment_check';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "maintenance_status_history_v1_assignee_guard"
BEFORE INSERT ON "maintenance_status_history"
FOR EACH ROW EXECUTE FUNCTION "guard_v1_maintenance_history_assignee"();

COMMIT;
