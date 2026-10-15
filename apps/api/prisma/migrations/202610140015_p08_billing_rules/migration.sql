-- P08-01 billing rules completion. Additive on top of 202610140014; no data is dropped.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. Invoice: tenant snapshot, occupant-count confirmation audit, vehicle-billing claim.
ALTER TABLE "invoices"
  ADD COLUMN "tenant_id" UUID,
  ADD COLUMN "occupant_count_confirmed_by" UUID,
  ADD COLUMN "occupant_count_confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "bills_vehicles" BOOLEAN;

-- Backfill rows that may already exist from 014. The immutability trigger is paused only for
-- these deterministic, derive-from-existing-data statements and is re-enabled immediately.
ALTER TABLE "invoices" DISABLE TRIGGER "invoices_guard_update";

UPDATE "invoices" i SET "tenant_id" = c."tenant_id"
  FROM "contracts" c WHERE c."id" = i."contract_id";

UPDATE "invoices"
  SET "occupant_count_confirmed_by" = "created_by", "occupant_count_confirmed_at" = "created_at"
  WHERE "occupant_count" IS NOT NULL;

-- At most one invoice per tenant and period keeps the vehicle-billing claim.
UPDATE "invoices" SET "bills_vehicles" = TRUE WHERE "id" IN (
  SELECT DISTINCT ON (i."tenant_id", i."period") i."id"
  FROM "invoices" i
  JOIN "invoice_items" it ON it."invoice_id" = i."id" AND it."item_type" = 'VEHICLE'
  ORDER BY i."tenant_id", i."period", i."created_at", i."id"
);

ALTER TABLE "invoices" ENABLE TRIGGER "invoices_guard_update";

ALTER TABLE "invoices" ALTER COLUMN "tenant_id" SET NOT NULL;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_occupant_confirmation_check" CHECK (
    ("occupant_count" IS NULL AND "occupant_count_confirmed_by" IS NULL AND "occupant_count_confirmed_at" IS NULL)
    OR ("occupant_count" IS NOT NULL AND "occupant_count_confirmed_by" IS NOT NULL AND "occupant_count_confirmed_at" IS NOT NULL)
  );

-- Contract FK now pins the tenant too, so the invoice tenant can never diverge from the contract.
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_contract_scope_fkey";
CREATE UNIQUE INDEX "contracts_id_room_id_tenant_id_workspace_id_key"
  ON "contracts" ("id", "room_id", "tenant_id", "workspace_id");
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_contract_scope_fkey"
  FOREIGN KEY ("contract_id", "room_id", "tenant_id", "workspace_id")
  REFERENCES "contracts"("id", "room_id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "contracts_id_room_id_workspace_id_key";

-- A tenant's vehicles are billed on exactly one invoice per period.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_vehicle_billing_excl"
  EXCLUDE USING gist ("tenant_id" WITH =, "period" WITH =) WHERE ("bills_vehicles" IS TRUE);

CREATE OR REPLACE FUNCTION "guard_invoice_update"()
RETURNS trigger AS $$
DECLARE
  item_count INTEGER;
  item_sum NUMERIC;
BEGIN
  IF OLD."status" = 'ISSUED' THEN
    RAISE EXCEPTION 'issued invoices are immutable';
  END IF;
  IF NEW."workspace_id" <> OLD."workspace_id" OR NEW."building_id" <> OLD."building_id"
     OR NEW."room_id" <> OLD."room_id" OR NEW."contract_id" <> OLD."contract_id"
     OR NEW."tenant_id" <> OLD."tenant_id" OR NEW."period" <> OLD."period" THEN
    RAISE EXCEPTION 'invoice scope and period cannot change';
  END IF;
  IF NEW."status" = 'ISSUED' THEN
    SELECT COUNT(*), COALESCE(SUM("amount"), 0) INTO item_count, item_sum
      FROM "invoice_items" WHERE "invoice_id" = NEW."id";
    IF item_count = 0 OR NEW."total_amount" IS DISTINCT FROM item_sum THEN
      RAISE EXCEPTION 'issued invoice total must equal the sum of its items';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Which Building Rate codes apply to which room, with history.
CREATE TABLE "room_service_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "rate_code" VARCHAR(50) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by" UUID NOT NULL,
    "ended_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "room_service_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_service_assignments_code_check" CHECK ("rate_code" = UPPER("rate_code") AND "rate_code" ~ '^[A-Z][A-Z0-9_]{0,49}$'),
    CONSTRAINT "room_service_assignments_period_check" CHECK ("effective_to" IS NULL OR "effective_from" < "effective_to")
);

CREATE INDEX "room_service_assignments_scope_idx"
  ON "room_service_assignments" ("workspace_id", "building_id", "room_id", "rate_code", "effective_from");

ALTER TABLE "room_service_assignments"
  ADD CONSTRAINT "room_service_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "room_service_assignments_room_scope_fkey" FOREIGN KEY ("room_id", "building_id", "workspace_id") REFERENCES "rooms"("id", "building_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "room_service_assignments_period_excl"
  EXCLUDE USING gist (
    "room_id" WITH =,
    "rate_code" WITH =,
    daterange("effective_from", COALESCE("effective_to", 'infinity'::date), '[)') WITH &&
  );

CREATE OR REPLACE FUNCTION "prevent_room_service_assignment_hard_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'room service assignment history cannot be hard-deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "room_service_assignments_prevent_hard_delete"
BEFORE DELETE ON "room_service_assignments"
FOR EACH ROW EXECUTE FUNCTION "prevent_room_service_assignment_hard_delete"();
