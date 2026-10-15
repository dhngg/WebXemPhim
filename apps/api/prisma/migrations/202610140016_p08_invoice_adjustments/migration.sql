CREATE TABLE "invoice_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "requested_amount" DECIMAL(14,4) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reference_adjustment_id" UUID,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_adjustments_amount_check" CHECK ("amount" <> 0),
    CONSTRAINT "invoice_adjustments_reason_check" CHECK (BTRIM("reason") <> ''),
    CONSTRAINT "invoice_adjustments_key_check" CHECK (CHAR_LENGTH("idempotency_key") >= 8),
    CONSTRAINT "invoice_adjustments_reference_self_check" CHECK ("reference_adjustment_id" IS NULL OR "reference_adjustment_id" <> "id")
);

CREATE UNIQUE INDEX "invoice_adjustments_id_invoice_id_key" ON "invoice_adjustments" ("id", "invoice_id");
CREATE UNIQUE INDEX "invoice_adjustments_invoice_idempotency_key" ON "invoice_adjustments" ("invoice_id", "idempotency_key");
CREATE UNIQUE INDEX "invoice_adjustments_reference_key" ON "invoice_adjustments" ("reference_adjustment_id");
CREATE INDEX "invoice_adjustments_scope_idx" ON "invoice_adjustments" ("workspace_id", "invoice_id", "created_at");

ALTER TABLE "invoice_adjustments"
  ADD CONSTRAINT "invoice_adjustments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_adjustments_invoice_scope_fkey" FOREIGN KEY ("invoice_id", "workspace_id") REFERENCES "invoices"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_adjustments_reference_fkey" FOREIGN KEY ("reference_adjustment_id", "invoice_id") REFERENCES "invoice_adjustments"("id", "invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only ISSUED invoices accept adjustments, and the adjusted total can never go below zero.
-- The invoice row is locked so concurrent adjustments are evaluated one after another.
CREATE OR REPLACE FUNCTION "guard_invoice_adjustment_insert"()
RETURNS trigger AS $$
DECLARE
  inv_status "invoice_status";
  inv_total NUMERIC;
  existing NUMERIC;
BEGIN
  SELECT "status", "total_amount" INTO inv_status, inv_total
    FROM "invoices" WHERE "id" = NEW."invoice_id" AND "workspace_id" = NEW."workspace_id" FOR UPDATE;
  IF inv_status IS DISTINCT FROM 'ISSUED' THEN
    RAISE EXCEPTION 'adjustments require an ISSUED invoice';
  END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO existing FROM "invoice_adjustments" WHERE "invoice_id" = NEW."invoice_id";
  IF inv_total + existing + NEW."amount" < 0 THEN
    RAISE EXCEPTION 'adjusted invoice total cannot be negative';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_adjustments_guard_insert"
BEFORE INSERT ON "invoice_adjustments"
FOR EACH ROW EXECUTE FUNCTION "guard_invoice_adjustment_insert"();

CREATE OR REPLACE FUNCTION "prevent_invoice_adjustment_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invoice adjustments are append-only; correct mistakes with a new referencing adjustment';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_adjustments_append_only"
BEFORE UPDATE OR DELETE ON "invoice_adjustments"
FOR EACH ROW EXECUTE FUNCTION "prevent_invoice_adjustment_mutation"();
