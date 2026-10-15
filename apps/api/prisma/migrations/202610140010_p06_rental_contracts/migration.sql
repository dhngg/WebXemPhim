CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE "contract_status" AS ENUM ('ACTIVE', 'ENDED');

CREATE TABLE "contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "monthly_rent" DECIMAL(14,2) NOT NULL,
    "status" "contract_status" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "ended_by_user_id" UUID,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contracts_period_check" CHECK ("start_date" <= "end_date"),
    CONSTRAINT "contracts_monthly_rent_check" CHECK ("monthly_rent" >= 0),
    CONSTRAINT "contracts_end_state_check" CHECK (
      ("status" = 'ACTIVE' AND "ended_at" IS NULL AND "ended_by_user_id" IS NULL)
      OR ("status" = 'ENDED' AND "ended_at" IS NOT NULL AND "ended_by_user_id" IS NOT NULL)
    )
);

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "contracts_room_id_workspace_id_fkey" FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "contracts_tenant_id_workspace_id_fkey" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "tenants"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "contracts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "contracts_ended_by_user_id_fkey" FOREIGN KEY ("ended_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_active_room_period_excl"
  EXCLUDE USING gist (
    "room_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("status" = 'ACTIVE');

CREATE INDEX "contracts_workspace_status_start_idx" ON "contracts" ("workspace_id", "status", "start_date");
CREATE INDEX "contracts_room_status_period_idx" ON "contracts" ("room_id", "status", "start_date", "end_date");
CREATE INDEX "contracts_tenant_status_start_idx" ON "contracts" ("tenant_id", "status", "start_date");

CREATE OR REPLACE FUNCTION "prevent_contract_hard_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'contracts cannot be hard-deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "contracts_prevent_hard_delete"
BEFORE DELETE ON "contracts"
FOR EACH ROW EXECUTE FUNCTION "prevent_contract_hard_delete"();

CREATE OR REPLACE FUNCTION "protect_active_contract_room_state"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'OCCUPIED' AND NEW."status" <> 'OCCUPIED'
     AND EXISTS (SELECT 1 FROM "contracts" c WHERE c."room_id" = OLD."id" AND c."status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'room with an active contract must remain occupied';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rooms_protect_active_contract_state"
BEFORE UPDATE OF "status" ON "rooms"
FOR EACH ROW EXECUTE FUNCTION "protect_active_contract_room_state"();

CREATE OR REPLACE FUNCTION "protect_active_contract_building_archive"()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'ARCHIVED' AND OLD."status" <> 'ARCHIVED'
     AND EXISTS (
       SELECT 1 FROM "contracts" c
       JOIN "rooms" r ON r."id" = c."room_id"
       WHERE r."building_id" = OLD."id" AND c."status" = 'ACTIVE'
     ) THEN
    RAISE EXCEPTION 'building with an active contract cannot be archived';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "buildings_protect_active_contract_archive"
BEFORE UPDATE OF "status" ON "buildings"
FOR EACH ROW EXECUTE FUNCTION "protect_active_contract_building_archive"();
