-- P09 maintenance. Additive only: new enums, tables, functions and triggers. Nothing is dropped,
-- altered or backfilled.
CREATE TYPE "maintenance_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "maintenance_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "contract_id" UUID,
    "tenant_id" UUID,
    "requested_by" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "maintenance_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "maintenance_status" NOT NULL DEFAULT 'OPEN',
    "assignee_user_id" UUID,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "maintenance_requests_title_check" CHECK (BTRIM("title") <> ''),
    CONSTRAINT "maintenance_requests_description_check" CHECK (BTRIM("description") <> ''),
    CONSTRAINT "maintenance_requests_contract_tenant_check" CHECK (("contract_id" IS NULL) = ("tenant_id" IS NULL)),
    CONSTRAINT "maintenance_requests_state_check" CHECK (
      ("status" = 'OPEN' AND "resolved_at" IS NULL AND "closed_at" IS NULL)
      OR ("status" = 'IN_PROGRESS' AND "assignee_user_id" IS NOT NULL AND "resolved_at" IS NULL AND "closed_at" IS NULL)
      OR ("status" = 'RESOLVED' AND "assignee_user_id" IS NOT NULL AND "resolved_at" IS NOT NULL AND "closed_at" IS NULL
          AND "resolution_note" IS NOT NULL AND BTRIM("resolution_note") <> '')
      OR ("status" = 'CLOSED' AND "resolved_at" IS NOT NULL AND "closed_at" IS NOT NULL
          AND "resolution_note" IS NOT NULL AND BTRIM("resolution_note") <> '')
    )
);

CREATE TABLE "maintenance_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "from_status" "maintenance_status",
    "to_status" "maintenance_status" NOT NULL,
    "priority" "maintenance_priority" NOT NULL,
    "assignee_user_id" UUID,
    "note" VARCHAR(1000),
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "maintenance_status_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "maintenance_requests_id_workspace_id_key" ON "maintenance_requests" ("id", "workspace_id");
CREATE INDEX "maintenance_requests_scope_status_idx" ON "maintenance_requests" ("workspace_id", "building_id", "status", "priority");
CREATE INDEX "maintenance_requests_room_status_idx" ON "maintenance_requests" ("room_id", "status");
CREATE INDEX "maintenance_requests_tenant_idx" ON "maintenance_requests" ("tenant_id", "created_at");
CREATE INDEX "maintenance_requests_assignee_idx" ON "maintenance_requests" ("assignee_user_id", "status");
CREATE INDEX "maintenance_status_history_scope_idx" ON "maintenance_status_history" ("workspace_id", "request_id", "created_at");

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "maintenance_requests_room_scope_fkey" FOREIGN KEY ("room_id", "building_id", "workspace_id") REFERENCES "rooms"("id", "building_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "maintenance_requests_contract_scope_fkey" FOREIGN KEY ("contract_id", "room_id", "tenant_id", "workspace_id") REFERENCES "contracts"("id", "room_id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "maintenance_status_history"
  ADD CONSTRAINT "maintenance_status_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "maintenance_status_history_request_scope_fkey" FOREIGN KEY ("request_id", "workspace_id") REFERENCES "maintenance_requests"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- State machine, enforced in the database: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED, forward only.
-- Scope never changes, CLOSED rows are frozen and assignees must be members of the workspace.
CREATE OR REPLACE FUNCTION "guard_maintenance_request_update"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'CLOSED' THEN
    RAISE EXCEPTION 'closed maintenance requests are immutable';
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
  ) THEN
    RAISE EXCEPTION 'invalid maintenance status transition % -> %', OLD."status", NEW."status";
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

CREATE TRIGGER "maintenance_requests_guard_update"
BEFORE UPDATE ON "maintenance_requests"
FOR EACH ROW EXECUTE FUNCTION "guard_maintenance_request_update"();

CREATE OR REPLACE FUNCTION "prevent_maintenance_hard_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'maintenance requests and their history cannot be hard-deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "maintenance_requests_prevent_hard_delete"
BEFORE DELETE ON "maintenance_requests"
FOR EACH ROW EXECUTE FUNCTION "prevent_maintenance_hard_delete"();

CREATE OR REPLACE FUNCTION "prevent_maintenance_history_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'maintenance history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "maintenance_status_history_append_only"
BEFORE UPDATE OR DELETE ON "maintenance_status_history"
FOR EACH ROW EXECUTE FUNCTION "prevent_maintenance_history_mutation"();
