CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE "rate_service_type" AS ENUM ('ELECTRICITY', 'WATER', 'WIFI', 'TRASH', 'PARKING', 'OTHER');
CREATE TYPE "rate_billing_unit" AS ENUM ('KWH', 'CUBIC_METER', 'ROOM', 'PERSON', 'VEHICLE', 'FIXED');
CREATE TYPE "rate_plan_status" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "rate_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "service_type" "rate_service_type" NOT NULL,
    "billing_unit" "rate_billing_unit" NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" "rate_plan_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rate_plans_code_check" CHECK ("code" = UPPER("code") AND "code" ~ '^[A-Z][A-Z0-9_]{0,49}$'),
    CONSTRAINT "rate_plans_name_check" CHECK (BTRIM("name") <> ''),
    CONSTRAINT "rate_plans_price_check" CHECK ("unit_price" >= 0),
    CONSTRAINT "rate_plans_period_check" CHECK ("effective_to" IS NULL OR "effective_from" < "effective_to"),
    CONSTRAINT "rate_plans_status_check" CHECK (
      ("status" = 'ACTIVE' AND "effective_to" IS NULL)
      OR ("status" = 'INACTIVE' AND "effective_to" IS NOT NULL)
    )
);

ALTER TABLE "rate_plans"
  ADD CONSTRAINT "rate_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rate_plans_building_id_workspace_id_fkey" FOREIGN KEY ("building_id", "workspace_id") REFERENCES "buildings"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rate_plans"
  ADD CONSTRAINT "rate_plans_period_excl"
  EXCLUDE USING gist (
    "building_id" WITH =,
    "code" WITH =,
    daterange("effective_from", COALESCE("effective_to", 'infinity'::date), '[)') WITH &&
  );

CREATE INDEX "rate_plans_scope_code_effective_idx" ON "rate_plans" ("workspace_id", "building_id", "code", "effective_from");
CREATE INDEX "rate_plans_building_status_effective_idx" ON "rate_plans" ("building_id", "status", "effective_from");

CREATE OR REPLACE FUNCTION "prevent_rate_plan_hard_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'rate plan history cannot be hard-deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rate_plans_prevent_hard_delete"
BEFORE DELETE ON "rate_plans"
FOR EACH ROW EXECUTE FUNCTION "prevent_rate_plan_hard_delete"();
