CREATE TYPE "payment_entry_kind" AS ENUM ('PAYMENT', 'REVERSAL');
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER');

-- Append-only ledger: a mistaken confirmation is undone by a REVERSAL entry, never by editing a row.
CREATE TABLE "invoice_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" "payment_entry_kind" NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "method" "payment_method" NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "note" VARCHAR(500),
    "reverses_payment_id" UUID,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "confirmed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_payments_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "invoice_payments_key_check" CHECK (CHAR_LENGTH("idempotency_key") >= 8),
    CONSTRAINT "invoice_payments_kind_check" CHECK (
      ("kind" = 'PAYMENT' AND "reverses_payment_id" IS NULL)
      OR ("kind" = 'REVERSAL' AND "reverses_payment_id" IS NOT NULL AND "note" IS NOT NULL AND BTRIM("note") <> '')
    ),
    CONSTRAINT "invoice_payments_reverses_self_check" CHECK ("reverses_payment_id" IS NULL OR "reverses_payment_id" <> "id")
);

CREATE UNIQUE INDEX "invoice_payments_id_invoice_id_key" ON "invoice_payments" ("id", "invoice_id");
CREATE UNIQUE INDEX "invoice_payments_invoice_idempotency_key" ON "invoice_payments" ("invoice_id", "idempotency_key");
CREATE UNIQUE INDEX "invoice_payments_reverses_key" ON "invoice_payments" ("reverses_payment_id", "invoice_id");
CREATE INDEX "invoice_payments_scope_idx" ON "invoice_payments" ("workspace_id", "invoice_id", "received_at");

ALTER TABLE "invoice_payments"
  ADD CONSTRAINT "invoice_payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_payments_invoice_scope_fkey" FOREIGN KEY ("invoice_id", "workspace_id") REFERENCES "invoices"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_payments_reverses_fkey" FOREIGN KEY ("reverses_payment_id", "invoice_id") REFERENCES "invoice_payments"("id", "invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only ISSUED invoices take payments and paid money can never exceed the amount due
-- (invoice total + adjustments). The invoice row is locked so concurrent entries serialize.
CREATE OR REPLACE FUNCTION "guard_invoice_payment_insert"()
RETURNS trigger AS $$
DECLARE
  inv_status "invoice_status";
  inv_total NUMERIC;
  adjusted NUMERIC;
  paid NUMERIC;
  orig_kind "payment_entry_kind";
  orig_amount NUMERIC;
  orig_method "payment_method";
BEGIN
  SELECT "status", "total_amount" INTO inv_status, inv_total
    FROM "invoices" WHERE "id" = NEW."invoice_id" AND "workspace_id" = NEW."workspace_id" FOR UPDATE;
  IF inv_status IS DISTINCT FROM 'ISSUED' THEN
    RAISE EXCEPTION 'payments require an ISSUED invoice';
  END IF;
  IF NEW."kind" = 'PAYMENT' THEN
    SELECT COALESCE(SUM(CASE WHEN "kind" = 'PAYMENT' THEN "amount" ELSE -"amount" END), 0) INTO paid
      FROM "invoice_payments" WHERE "invoice_id" = NEW."invoice_id";
    SELECT inv_total + COALESCE(SUM("amount"), 0) INTO adjusted
      FROM "invoice_adjustments" WHERE "invoice_id" = NEW."invoice_id";
    IF paid + NEW."amount" > adjusted THEN
      RAISE EXCEPTION 'payments cannot exceed the amount due';
    END IF;
  ELSE
    SELECT "kind", "amount", "method" INTO orig_kind, orig_amount, orig_method
      FROM "invoice_payments" WHERE "id" = NEW."reverses_payment_id" AND "invoice_id" = NEW."invoice_id";
    IF orig_kind IS DISTINCT FROM 'PAYMENT' OR orig_amount <> NEW."amount" OR orig_method <> NEW."method" THEN
      RAISE EXCEPTION 'a reversal must fully reverse a payment of the same invoice';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_payments_guard_insert"
BEFORE INSERT ON "invoice_payments"
FOR EACH ROW EXECUTE FUNCTION "guard_invoice_payment_insert"();

CREATE OR REPLACE FUNCTION "prevent_invoice_payment_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invoice payments are append-only; undo a mistake with a reversal entry';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_payments_append_only"
BEFORE UPDATE OR DELETE ON "invoice_payments"
FOR EACH ROW EXECUTE FUNCTION "prevent_invoice_payment_mutation"();

-- An adjustment may no longer push the amount due below money already received: that would be a
-- negative outstanding balance. The payment must be reversed or refunded first.
CREATE OR REPLACE FUNCTION "guard_invoice_adjustment_insert"()
RETURNS trigger AS $$
DECLARE
  inv_status "invoice_status";
  inv_total NUMERIC;
  existing NUMERIC;
  paid NUMERIC;
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
  SELECT COALESCE(SUM(CASE WHEN "kind" = 'PAYMENT' THEN "amount" ELSE -"amount" END), 0) INTO paid
    FROM "invoice_payments" WHERE "invoice_id" = NEW."invoice_id";
  IF inv_total + existing + NEW."amount" < paid THEN
    RAISE EXCEPTION 'adjusted invoice total cannot fall below the amount already paid; reverse or refund payments first';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
