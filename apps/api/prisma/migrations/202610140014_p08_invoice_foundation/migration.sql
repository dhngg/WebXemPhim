CREATE UNIQUE INDEX "contracts_id_room_id_workspace_id_key" ON "contracts" ("id", "room_id", "workspace_id");

CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'ISSUED');
CREATE TYPE "invoice_item_type" AS ENUM ('RENT', 'ELECTRICITY', 'WATER', 'SERVICE', 'VEHICLE');

CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "occupant_count" INTEGER,
    "due_date" DATE,
    "notes" TEXT,
    "missing_items" JSONB NOT NULL DEFAULT '[]',
    "total_amount" DECIMAL(14,0),
    "rounding_rule" VARCHAR(40) NOT NULL DEFAULT 'ROUND_HALF_UP_1_VND',
    "created_by" UUID NOT NULL,
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_period_check" CHECK (EXTRACT(DAY FROM "period") = 1),
    CONSTRAINT "invoices_occupant_check" CHECK ("occupant_count" IS NULL OR "occupant_count" >= 0),
    CONSTRAINT "invoices_rounding_check" CHECK ("rounding_rule" = 'ROUND_HALF_UP_1_VND'),
    CONSTRAINT "invoices_status_check" CHECK (
      ("status" = 'DRAFT' AND "total_amount" IS NULL AND "issued_at" IS NULL AND "issued_by" IS NULL)
      OR ("status" = 'ISSUED' AND "total_amount" IS NOT NULL AND "total_amount" >= 0
          AND "issued_at" IS NOT NULL AND "issued_by" IS NOT NULL AND "missing_items" = '[]'::jsonb)
    )
);

CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "item_type" "invoice_item_type" NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "proration_numerator" INTEGER,
    "proration_denominator" INTEGER,
    "amount" DECIMAL(14,0) NOT NULL,
    "rate_plan_id" UUID,
    "meter_reading_id" UUID,
    "meter_revision" INTEGER,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_items_amounts_check" CHECK ("quantity" >= 0 AND "unit_price" >= 0 AND "amount" >= 0),
    CONSTRAINT "invoice_items_proration_check" CHECK (
      ("proration_numerator" IS NULL AND "proration_denominator" IS NULL)
      OR ("proration_numerator" IS NOT NULL AND "proration_denominator" IS NOT NULL
          AND "proration_denominator" > 0 AND "proration_numerator" > 0
          AND "proration_numerator" <= "proration_denominator")
    ),
    CONSTRAINT "invoice_items_meter_check" CHECK (("meter_reading_id" IS NULL) = ("meter_revision" IS NULL))
);

CREATE UNIQUE INDEX "invoices_id_workspace_id_key" ON "invoices" ("id", "workspace_id");
CREATE UNIQUE INDEX "invoices_contract_period_key" ON "invoices" ("contract_id", "period");
CREATE INDEX "invoices_scope_period_status_idx" ON "invoices" ("workspace_id", "building_id", "period", "status");
CREATE INDEX "invoices_room_period_idx" ON "invoices" ("room_id", "period");
CREATE UNIQUE INDEX "invoice_items_invoice_sort_key" ON "invoice_items" ("invoice_id", "sort_order");
CREATE INDEX "invoice_items_scope_idx" ON "invoice_items" ("workspace_id", "invoice_id");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_room_scope_fkey" FOREIGN KEY ("room_id", "building_id", "workspace_id") REFERENCES "rooms"("id", "building_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_contract_scope_fkey" FOREIGN KEY ("contract_id", "room_id", "workspace_id") REFERENCES "contracts"("id", "room_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_items_invoice_scope_fkey" FOREIGN KEY ("invoice_id", "workspace_id") REFERENCES "invoices"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_items_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_items_meter_reading_id_fkey" FOREIGN KEY ("meter_reading_id") REFERENCES "meter_readings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
     OR NEW."period" <> OLD."period" THEN
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

CREATE TRIGGER "invoices_guard_update"
BEFORE UPDATE ON "invoices"
FOR EACH ROW EXECUTE FUNCTION "guard_invoice_update"();

CREATE OR REPLACE FUNCTION "guard_invoice_delete"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'ISSUED' THEN
    RAISE EXCEPTION 'issued invoices cannot be hard-deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoices_guard_delete"
BEFORE DELETE ON "invoices"
FOR EACH ROW EXECUTE FUNCTION "guard_invoice_delete"();

CREATE OR REPLACE FUNCTION "guard_invoice_item_change"()
RETURNS trigger AS $$
DECLARE
  parent_status "invoice_status";
BEGIN
  SELECT "status" INTO parent_status FROM "invoices"
    WHERE "id" = COALESCE(NEW."invoice_id", OLD."invoice_id");
  IF parent_status IS NOT NULL AND parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'items of issued invoices are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_items_guard_change"
BEFORE INSERT OR UPDATE OR DELETE ON "invoice_items"
FOR EACH ROW EXECUTE FUNCTION "guard_invoice_item_change"();
