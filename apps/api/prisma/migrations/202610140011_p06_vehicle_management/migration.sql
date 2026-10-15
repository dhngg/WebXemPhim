CREATE TYPE "vehicle_status" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "license_plate" VARCHAR(20) NOT NULL,
    "vehicle_type" VARCHAR(50) NOT NULL,
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "color" VARCHAR(50),
    "notes" TEXT,
    "status" "vehicle_status" NOT NULL DEFAULT 'ACTIVE',
    "inactive_at" TIMESTAMPTZ(6),
    "inactive_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicles_workspace_license_plate_key" UNIQUE ("workspace_id", "license_plate"),
    CONSTRAINT "vehicles_license_plate_normalized_check" CHECK (
      "license_plate" = UPPER("license_plate")
      AND "license_plate" ~ '^[A-Z0-9]{5,15}$'
    ),
    CONSTRAINT "vehicles_type_check" CHECK (BTRIM("vehicle_type") <> ''),
    CONSTRAINT "vehicles_status_check" CHECK (
      ("status" = 'ACTIVE' AND "inactive_at" IS NULL AND "inactive_reason" IS NULL)
      OR ("status" = 'INACTIVE' AND "inactive_at" IS NOT NULL)
    )
);

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "vehicles_tenant_id_workspace_id_fkey" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "tenants"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "vehicles_workspace_status_created_idx" ON "vehicles" ("workspace_id", "status", "created_at");
CREATE INDEX "vehicles_tenant_status_idx" ON "vehicles" ("tenant_id", "status");

CREATE OR REPLACE FUNCTION "prevent_vehicle_hard_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vehicles cannot be hard-deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "vehicles_prevent_hard_delete"
BEFORE DELETE ON "vehicles"
FOR EACH ROW EXECUTE FUNCTION "prevent_vehicle_hard_delete"();
