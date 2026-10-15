-- Password reset tokens. Additive only: one new table with its indexes and triggers. No existing
-- table, row, enum, constraint or trigger is altered, and no data is written. Only the SHA-256
-- digest of a token is stored; the raw token exists only in the e-mailed link.
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "password_reset_tokens_hash_length_check" CHECK (octet_length("token_hash") = 32),
    CONSTRAINT "password_reset_tokens_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens" ("token_hash");
CREATE INDEX "password_reset_tokens_user_created_idx" ON "password_reset_tokens" ("user_id", "created_at" DESC);
-- At most one live (unconsumed) token per user: concurrent requests cannot both leave a usable token.
CREATE UNIQUE INDEX "password_reset_tokens_one_active_per_user_idx" ON "password_reset_tokens" ("user_id") WHERE "consumed_at" IS NULL;

-- A token is single-use and immutable: the only allowed change is consumed_at NULL -> timestamp.
CREATE OR REPLACE FUNCTION "guard_password_reset_token_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'password reset tokens cannot be hard-deleted';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
     OR NEW."token_hash" IS DISTINCT FROM OLD."token_hash"
     OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'only the consumed state of a password reset token can change';
  END IF;
  IF OLD."consumed_at" IS NOT NULL AND NEW."consumed_at" IS DISTINCT FROM OLD."consumed_at" THEN
    RAISE EXCEPTION 'a consumed password reset token cannot be reused';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "password_reset_tokens_guard_mutation"
BEFORE UPDATE OR DELETE ON "password_reset_tokens"
FOR EACH ROW EXECUTE FUNCTION "guard_password_reset_token_mutation"();
