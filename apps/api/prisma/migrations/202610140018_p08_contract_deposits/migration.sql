CREATE UNIQUE INDEX "contracts_id_workspace_id_key" ON "contracts" ("id", "workspace_id");

CREATE TYPE "deposit_entry_kind" AS ENUM ('COLLECTION', 'DEDUCTION', 'REFUND', 'REVERSAL');

-- Append-only deposit ledger, kept separate from rent revenue and from invoices.
--   COLLECTION: deposit received.            DEDUCTION: amount withheld (reason + reference required).
--   REFUND:     money actually handed back (reason + real refund reference required).  REVERSAL: compensating entry that undoes a mistaken record.
CREATE TABLE "contract_deposit_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "kind" "deposit_entry_kind" NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "method" "payment_method",
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" VARCHAR(500),
    "reference" VARCHAR(200),
    "note" VARCHAR(500),
    "reverses_entry_id" UUID,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_deposit_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_deposit_entries_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "contract_deposit_entries_key_check" CHECK (CHAR_LENGTH("idempotency_key") >= 8),
    CONSTRAINT "contract_deposit_entries_self_check" CHECK ("reverses_entry_id" IS NULL OR "reverses_entry_id" <> "id"),
    CONSTRAINT "contract_deposit_entries_kind_check" CHECK (
      ("kind" = 'COLLECTION' AND "method" IS NOT NULL AND "reverses_entry_id" IS NULL)
      OR ("kind" = 'REFUND' AND "method" IS NOT NULL AND "reverses_entry_id" IS NULL
          AND "reason" IS NOT NULL AND BTRIM("reason") <> ''
          AND "reference" IS NOT NULL AND BTRIM("reference") <> '')
      OR ("kind" = 'DEDUCTION' AND "method" IS NULL AND "reverses_entry_id" IS NULL
          AND "reason" IS NOT NULL AND BTRIM("reason") <> ''
          AND "reference" IS NOT NULL AND BTRIM("reference") <> '')
      OR ("kind" = 'REVERSAL' AND "reverses_entry_id" IS NOT NULL
          AND "reason" IS NOT NULL AND BTRIM("reason") <> '')
    )
);

CREATE UNIQUE INDEX "contract_deposit_entries_id_contract_id_key" ON "contract_deposit_entries" ("id", "contract_id");
CREATE UNIQUE INDEX "contract_deposit_entries_contract_idempotency_key" ON "contract_deposit_entries" ("contract_id", "idempotency_key");
CREATE UNIQUE INDEX "contract_deposit_entries_reverses_key" ON "contract_deposit_entries" ("reverses_entry_id", "contract_id");
CREATE INDEX "contract_deposit_entries_scope_idx" ON "contract_deposit_entries" ("workspace_id", "contract_id", "occurred_at");

ALTER TABLE "contract_deposit_entries"
  ADD CONSTRAINT "contract_deposit_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "contract_deposit_entries_contract_scope_fkey" FOREIGN KEY ("contract_id", "workspace_id") REFERENCES "contracts"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "contract_deposit_entries_reverses_fkey" FOREIGN KEY ("reverses_entry_id", "contract_id") REFERENCES "contract_deposit_entries"("id", "contract_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Balance = collections - deductions - refunds, where a reversal cancels the effect of the entry
-- it reverses. Contract status is irrelevant: the ledger survives the end of the contract.
CREATE OR REPLACE FUNCTION "contract_deposit_balance"(target UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(
    CASE e."kind"
      WHEN 'COLLECTION' THEN e."amount"
      WHEN 'DEDUCTION' THEN -e."amount"
      WHEN 'REFUND' THEN -e."amount"
      ELSE CASE WHEN o."kind" = 'COLLECTION' THEN -e."amount" ELSE e."amount" END
    END), 0)
  FROM "contract_deposit_entries" e
  LEFT JOIN "contract_deposit_entries" o ON o."id" = e."reverses_entry_id"
  WHERE e."contract_id" = target;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION "guard_contract_deposit_insert"()
RETURNS trigger AS $$
DECLARE
  orig_kind "deposit_entry_kind";
  orig_amount NUMERIC;
  orig_method "payment_method";
  effect NUMERIC;
  actor_role TEXT;
BEGIN
  -- Lock the contract row so concurrent entries are evaluated one after another.
  PERFORM 1 FROM "contracts" WHERE "id" = NEW."contract_id" AND "workspace_id" = NEW."workspace_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit entries require an existing contract of the workspace';
  END IF;
  SELECT m."role"::text INTO actor_role FROM "workspace_memberships" m
    WHERE m."workspace_id" = NEW."workspace_id" AND m."user_id" = NEW."created_by";
  IF actor_role IS NULL OR actor_role NOT IN ('OWNER', 'MANAGER') THEN
    RAISE EXCEPTION 'only a workspace OWNER or MANAGER can write deposit entries';
  END IF;
  -- Archived workspace or building: the only allowed change is an OWNER recording a REFUND of the
  -- remaining deposit. Collections, deductions and reversals stay blocked.
  IF EXISTS (
    SELECT 1 FROM "workspaces" w WHERE w."id" = NEW."workspace_id" AND w."status"::text <> 'ACTIVE'
  ) OR EXISTS (
    SELECT 1 FROM "contracts" c
      JOIN "rooms" r ON r."id" = c."room_id"
      JOIN "buildings" b ON b."id" = r."building_id"
      WHERE c."id" = NEW."contract_id" AND b."status"::text <> 'ACTIVE'
  ) THEN
    IF NEW."kind" <> 'REFUND' THEN
      RAISE EXCEPTION 'only a REFUND can be recorded while the workspace or building is archived';
    END IF;
    IF actor_role <> 'OWNER' THEN
      RAISE EXCEPTION 'only the workspace OWNER can record a refund while the workspace or building is archived';
    END IF;
  END IF;
  IF NEW."kind" = 'REVERSAL' THEN
    SELECT "kind", "amount", "method" INTO orig_kind, orig_amount, orig_method
      FROM "contract_deposit_entries" WHERE "id" = NEW."reverses_entry_id" AND "contract_id" = NEW."contract_id";
    IF orig_kind IS NULL OR orig_kind = 'REVERSAL' OR orig_amount <> NEW."amount"
       OR orig_method IS DISTINCT FROM NEW."method" THEN
      RAISE EXCEPTION 'a reversal must fully reverse a collection, deduction or refund of the same contract';
    END IF;
    effect := CASE WHEN orig_kind = 'COLLECTION' THEN -NEW."amount" ELSE NEW."amount" END;
  ELSE
    effect := CASE WHEN NEW."kind" = 'COLLECTION' THEN NEW."amount" ELSE -NEW."amount" END;
  END IF;
  IF "contract_deposit_balance"(NEW."contract_id") + effect < 0 THEN
    RAISE EXCEPTION 'deposit balance cannot be negative';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "contract_deposit_entries_guard_insert"
BEFORE INSERT ON "contract_deposit_entries"
FOR EACH ROW EXECUTE FUNCTION "guard_contract_deposit_insert"();

CREATE OR REPLACE FUNCTION "prevent_contract_deposit_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'deposit entries are append-only; correct a mistake with a reversal entry';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "contract_deposit_entries_append_only"
BEFORE UPDATE OR DELETE ON "contract_deposit_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_contract_deposit_mutation"();
