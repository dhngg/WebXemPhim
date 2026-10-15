CREATE UNIQUE INDEX "rooms_id_building_id_workspace_id_key" ON "rooms" ("id", "building_id", "workspace_id");

CREATE TYPE "meter_type" AS ENUM ('ELECTRICITY', 'WATER');

CREATE TABLE "meter_readings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "meter_type" "meter_type" NOT NULL,
    "period" DATE NOT NULL,
    "previous_reading" DECIMAL(14,3) NOT NULL,
    "current_reading" DECIMAL(14,3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "meter_readings_period_check" CHECK (EXTRACT(DAY FROM "period") = 1),
    CONSTRAINT "meter_readings_previous_check" CHECK ("previous_reading" >= 0),
    CONSTRAINT "meter_readings_current_check" CHECK ("current_reading" >= "previous_reading"),
    CONSTRAINT "meter_readings_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "meter_reading_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "meter_reading_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "old_previous_reading" DECIMAL(14,3) NOT NULL,
    "old_current_reading" DECIMAL(14,3) NOT NULL,
    "new_previous_reading" DECIMAL(14,3) NOT NULL,
    "new_current_reading" DECIMAL(14,3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "adjusted_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meter_reading_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "meter_reading_adjustments_reason_check" CHECK (BTRIM("reason") <> ''),
    CONSTRAINT "meter_reading_adjustments_new_check" CHECK ("new_current_reading" >= "new_previous_reading"),
    CONSTRAINT "meter_reading_adjustments_revision_check" CHECK ("revision" >= 2)
);

CREATE UNIQUE INDEX "meter_readings_id_workspace_id_key" ON "meter_readings" ("id", "workspace_id");
CREATE UNIQUE INDEX "meter_readings_room_type_period_key" ON "meter_readings" ("room_id", "meter_type", "period");
CREATE INDEX "meter_readings_scope_period_idx" ON "meter_readings" ("workspace_id", "building_id", "period");
CREATE UNIQUE INDEX "meter_reading_adjustments_reading_revision_key" ON "meter_reading_adjustments" ("meter_reading_id", "revision");
CREATE INDEX "meter_reading_adjustments_scope_idx" ON "meter_reading_adjustments" ("workspace_id", "meter_reading_id");

ALTER TABLE "meter_readings"
  ADD CONSTRAINT "meter_readings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "meter_readings_room_scope_fkey" FOREIGN KEY ("room_id", "building_id", "workspace_id") REFERENCES "rooms"("id", "building_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meter_reading_adjustments"
  ADD CONSTRAINT "meter_reading_adjustments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "meter_reading_adjustments_reading_fkey" FOREIGN KEY ("meter_reading_id", "workspace_id") REFERENCES "meter_readings"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "prevent_meter_reading_hard_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'meter reading history cannot be hard-deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "meter_readings_prevent_hard_delete"
BEFORE DELETE ON "meter_readings"
FOR EACH ROW EXECUTE FUNCTION "prevent_meter_reading_hard_delete"();

CREATE OR REPLACE FUNCTION "prevent_meter_adjustment_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'meter reading adjustments are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "meter_reading_adjustments_append_only"
BEFORE UPDATE OR DELETE ON "meter_reading_adjustments"
FOR EACH ROW EXECUTE FUNCTION "prevent_meter_adjustment_mutation"();
