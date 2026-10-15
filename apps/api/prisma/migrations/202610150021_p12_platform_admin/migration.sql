-- P12 Platform Admin. Additive only: three new tables and their triggers. No ALTER/DROP/UPDATE/backfill
-- of existing tables or rows, and no admin is created here (grants are an operator action).
CREATE TABLE "platform_admins" (
    "user_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_note" VARCHAR(200),
    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "listing_moderations" (
    "listing_id" UUID NOT NULL,
    "is_hidden" BOOLEAN NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_moderations_pkey" PRIMARY KEY ("listing_id"),
    CONSTRAINT "listing_moderations_reason_check" CHECK (BTRIM("reason") <> ''),
    CONSTRAINT "listing_moderations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "listing_moderations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "listing_moderations_hidden_idx" ON "listing_moderations" ("is_hidden", "updated_at");

CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_audit_logs_reason_check" CHECK (BTRIM("reason") <> ''),
    CONSTRAINT "admin_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" ("created_at" DESC, "id");
CREATE INDEX "admin_audit_logs_actor_idx" ON "admin_audit_logs" ("actor_user_id", "created_at");
CREATE INDEX "admin_audit_logs_target_idx" ON "admin_audit_logs" ("target_type", "target_id", "created_at");

-- Defence in depth: only a current platform admin may write moderation state or audit rows.
CREATE OR REPLACE FUNCTION "require_platform_admin_actor"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actor UUID;
BEGIN
  IF TG_TABLE_NAME = 'admin_audit_logs' THEN
    v_actor := NEW."actor_user_id";
  ELSE
    v_actor := NEW."updated_by";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "platform_admins" WHERE "user_id" = v_actor) THEN
    RAISE EXCEPTION 'actor is not a platform admin';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "admin_audit_logs_require_admin" BEFORE INSERT ON "admin_audit_logs"
FOR EACH ROW EXECUTE FUNCTION "require_platform_admin_actor"();
CREATE TRIGGER "listing_moderations_require_admin" BEFORE INSERT OR UPDATE ON "listing_moderations"
FOR EACH ROW EXECUTE FUNCTION "require_platform_admin_actor"();

CREATE OR REPLACE FUNCTION "guard_admin_immutable"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'admin_audit_logs' THEN
    RAISE EXCEPTION 'admin audit logs are append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'listing moderation state cannot be deleted';
  END IF;
  IF NEW."listing_id" IS DISTINCT FROM OLD."listing_id" THEN
    RAISE EXCEPTION 'listing moderation cannot change listing';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "admin_audit_logs_immutable" BEFORE UPDATE OR DELETE ON "admin_audit_logs"
FOR EACH ROW EXECUTE FUNCTION "guard_admin_immutable"();
CREATE TRIGGER "listing_moderations_guard" BEFORE UPDATE OR DELETE ON "listing_moderations"
FOR EACH ROW EXECUTE FUNCTION "guard_admin_immutable"();
