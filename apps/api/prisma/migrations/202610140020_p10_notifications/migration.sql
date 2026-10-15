-- P10 in-app notifications. Additive only: one enum, one table, functions and triggers on existing
-- tables (no ALTER/DROP/UPDATE/backfill of existing rows). Notifications are produced by AFTER
-- triggers in the same transaction as the business event, so they cannot be lost or duplicated.
CREATE TYPE "notification_type" AS ENUM (
  'VIEWING_REQUESTED', 'VIEWING_CONFIRMED', 'VIEWING_REJECTED', 'VIEWING_CANCELLED',
  'MAINTENANCE_CREATED', 'MAINTENANCE_STATUS_CHANGED',
  'INVOICE_ISSUED'
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500),
    "dedupe_key" VARCHAR(120) NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_title_check" CHECK (BTRIM("title") <> '')
);

CREATE UNIQUE INDEX "notifications_user_dedupe_key" ON "notifications" ("user_id", "dedupe_key");
CREATE INDEX "notifications_user_created_idx" ON "notifications" ("user_id", "created_at" DESC, "id");
CREATE INDEX "notifications_user_unread_idx" ON "notifications" ("user_id") WHERE "read_at" IS NULL;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only read_at may change (NULL -> timestamp, never back); rows are never deleted.
CREATE OR REPLACE FUNCTION "guard_notification_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'notifications cannot be hard-deleted';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
     OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id" OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."entity_type" IS DISTINCT FROM OLD."entity_type" OR NEW."entity_id" IS DISTINCT FROM OLD."entity_id"
     OR NEW."title" IS DISTINCT FROM OLD."title" OR NEW."body" IS DISTINCT FROM OLD."body"
     OR NEW."dedupe_key" IS DISTINCT FROM OLD."dedupe_key" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'only notification read state can change';
  END IF;
  IF OLD."read_at" IS NOT NULL AND NEW."read_at" IS DISTINCT FROM OLD."read_at" THEN
    RAISE EXCEPTION 'a read notification cannot be marked unread';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "notifications_guard_mutation"
BEFORE UPDATE OR DELETE ON "notifications"
FOR EACH ROW EXECUTE FUNCTION "guard_notification_mutation"();

-- Inserts one notification per recipient; duplicates (same user + dedupe key) are ignored and the
-- actor never notifies themselves.
CREATE OR REPLACE FUNCTION "notify_users"(
  p_user_ids UUID[], p_workspace_id UUID, p_actor UUID, p_type "notification_type",
  p_entity_type TEXT, p_entity_id UUID, p_title TEXT, p_body TEXT, p_dedupe TEXT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "notifications" ("user_id", "workspace_id", "type", "entity_type", "entity_id", "title", "body", "dedupe_key")
  SELECT DISTINCT u."id", p_workspace_id, p_type, p_entity_type, p_entity_id, p_title, p_body, p_dedupe
  FROM "users" u
  WHERE u."id" = ANY(p_user_ids) AND u."status" = 'ACTIVE' AND u."id" IS DISTINCT FROM p_actor
  ON CONFLICT ("user_id", "dedupe_key") DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION "workspace_manager_ids"(p_workspace_id UUID)
RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg("user_id"), ARRAY[]::UUID[]) FROM "workspace_memberships"
  WHERE "workspace_id" = p_workspace_id AND "role" IN ('OWNER', 'MANAGER')
$$;

CREATE OR REPLACE FUNCTION "tenant_user_ids"(p_workspace_id UUID, p_tenant_id UUID)
RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg("user_id"), ARRAY[]::UUID[]) FROM "tenant_user_links"
  WHERE "workspace_id" = p_workspace_id AND "tenant_id" = p_tenant_id AND "revoked_at" IS NULL
$$;

-- Viewing requests: landlords hear about new/cancelled requests, the requester about decisions.
CREATE OR REPLACE FUNCTION "notify_viewing_request"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "notify_users"("workspace_manager_ids"(NEW."workspace_id"), NEW."workspace_id", NEW."requester_user_id",
      'VIEWING_REQUESTED', 'VIEWING_REQUEST', NEW."id", 'New viewing request', NULL, 'viewing:' || NEW."id" || ':REQUESTED');
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NEW."status" = 'CONFIRMED' THEN
      PERFORM "notify_users"(ARRAY[NEW."requester_user_id"], NEW."workspace_id", NEW."decided_by_user_id",
        'VIEWING_CONFIRMED', 'VIEWING_REQUEST', NEW."id", 'Viewing request confirmed', NULL, 'viewing:' || NEW."id" || ':CONFIRMED');
    ELSIF NEW."status" = 'REJECTED' THEN
      PERFORM "notify_users"(ARRAY[NEW."requester_user_id"], NEW."workspace_id", NEW."decided_by_user_id",
        'VIEWING_REJECTED', 'VIEWING_REQUEST', NEW."id", 'Viewing request rejected', NULL, 'viewing:' || NEW."id" || ':REJECTED');
    ELSIF NEW."status" = 'CANCELLED' THEN
      PERFORM "notify_users"("workspace_manager_ids"(NEW."workspace_id"), NEW."workspace_id", NEW."requester_user_id",
        'VIEWING_CANCELLED', 'VIEWING_REQUEST', NEW."id", 'Viewing request cancelled', NULL, 'viewing:' || NEW."id" || ':CANCELLED');
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "viewing_requests_notify"
AFTER INSERT OR UPDATE OF "status" ON "viewing_requests"
FOR EACH ROW EXECUTE FUNCTION "notify_viewing_request"();

-- Maintenance: driven by the append-only history row, which also records who acted. A change that
-- keeps the same status (priority/assignee edit) is not notified.
CREATE OR REPLACE FUNCTION "notify_maintenance_history"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_type "notification_type";
  v_title TEXT;
BEGIN
  IF NEW."from_status" IS NOT DISTINCT FROM NEW."to_status" THEN
    RETURN NULL;
  END IF;
  SELECT "id", "workspace_id", "tenant_id", "title" INTO r FROM "maintenance_requests" WHERE "id" = NEW."request_id";
  IF NEW."from_status" IS NULL THEN
    v_type := 'MAINTENANCE_CREATED';
    v_title := 'New maintenance request';
  ELSE
    v_type := 'MAINTENANCE_STATUS_CHANGED';
    v_title := 'Maintenance status changed: ' || NEW."to_status";
  END IF;
  PERFORM "notify_users"("workspace_manager_ids"(r."workspace_id"), r."workspace_id", NEW."changed_by",
    v_type, 'MAINTENANCE_REQUEST', r."id", v_title, LEFT(r."title", 200), 'maintenance:' || NEW."id");
  IF r."tenant_id" IS NOT NULL THEN
    PERFORM "notify_users"("tenant_user_ids"(r."workspace_id", r."tenant_id"), r."workspace_id", NEW."changed_by",
      v_type, 'MAINTENANCE_REQUEST', r."id", v_title, LEFT(r."title", 200), 'maintenance:' || NEW."id");
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "maintenance_history_notify"
AFTER INSERT ON "maintenance_status_history"
FOR EACH ROW EXECUTE FUNCTION "notify_maintenance_history"();

-- Invoices: the tenant's linked accounts are told when an invoice is issued.
CREATE OR REPLACE FUNCTION "notify_invoice_issued"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'ISSUED' AND (TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM 'ISSUED') THEN
    PERFORM "notify_users"("tenant_user_ids"(NEW."workspace_id", NEW."tenant_id"), NEW."workspace_id", NEW."issued_by",
      'INVOICE_ISSUED', 'INVOICE', NEW."id", 'New invoice issued', NULL, 'invoice:' || NEW."id" || ':ISSUED');
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "invoices_notify_issued"
AFTER INSERT OR UPDATE OF "status" ON "invoices"
FOR EACH ROW EXECUTE FUNCTION "notify_invoice_issued"();
