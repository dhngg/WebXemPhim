-- Step 2/2 of tenant maintenance cancellation: teach the state CHECK and the guard trigger about
-- CANCELLED. No row is inserted, updated or deleted; existing rows already satisfy the new CHECK
-- (it only adds a branch), which is verified by the ADD CONSTRAINT scan itself.

-- Swap the state CHECK in one transaction: the old predicates plus a CANCELLED branch.
ALTER TABLE "maintenance_requests" DROP CONSTRAINT "maintenance_requests_state_check";
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_state_check" CHECK (
  ("status" = 'OPEN' AND "resolved_at" IS NULL AND "closed_at" IS NULL)
  OR ("status" = 'IN_PROGRESS' AND "assignee_user_id" IS NOT NULL AND "resolved_at" IS NULL AND "closed_at" IS NULL)
  OR ("status" = 'RESOLVED' AND "assignee_user_id" IS NOT NULL AND "resolved_at" IS NOT NULL AND "closed_at" IS NULL
      AND "resolution_note" IS NOT NULL AND BTRIM("resolution_note") <> '')
  OR ("status" = 'CLOSED' AND "resolved_at" IS NOT NULL AND "closed_at" IS NOT NULL
      AND "resolution_note" IS NOT NULL AND BTRIM("resolution_note") <> '')
  OR ("status" = 'CANCELLED' AND "assignee_user_id" IS NULL AND "resolved_at" IS NULL AND "closed_at" IS NULL)
);

-- Same function as P09 plus: CLOSED and CANCELLED rows are frozen, and the only way into CANCELLED
-- is OPEN -> CANCELLED while nobody has been assigned. Forward-only for every other status.
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
  IF NEW."assignee_user_id" IS NOT NULL AND NEW."assignee_user_id" IS DISTINCT FROM OLD."assignee_user_id"
     AND NOT EXISTS (
       SELECT 1 FROM "workspace_memberships" m
       WHERE m."workspace_id" = NEW."workspace_id" AND m."user_id" = NEW."assignee_user_id"
     ) THEN
    RAISE EXCEPTION 'the assignee must be a member of the workspace';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
