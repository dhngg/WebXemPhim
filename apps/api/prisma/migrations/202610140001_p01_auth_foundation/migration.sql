-- P01-01 authentication database foundation.
-- This migration is reviewable but was not applied while being created.

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "auth_session_revoke_reason" AS ENUM (
    'ROTATED',
    'LOGOUT',
    'LOGOUT_ALL',
    'REUSE',
    'USER_DISABLED'
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(100),
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_normalized_check"
        CHECK ("email" = lower(btrim("email")))
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "parent_session_id" UUID,
    "replaced_by_session_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" "auth_session_revoke_reason",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key"
    ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_parent_session_id_key"
    ON "auth_sessions"("parent_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_replaced_by_session_id_key"
    ON "auth_sessions"("replaced_by_session_id");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_idx"
    ON "auth_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_sessions_family_id_revoked_at_idx"
    ON "auth_sessions"("family_id", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx"
    ON "auth_sessions"("expires_at");

-- Prisma schema cannot currently express this partial unique index.
-- It is the database guard that allows at most one unrevoked generation per family.
CREATE UNIQUE INDEX "auth_sessions_one_active_generation_per_family_key"
    ON "auth_sessions"("family_id")
    WHERE "revoked_at" IS NULL;

-- AddForeignKey
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_parent_session_id_fkey"
    FOREIGN KEY ("parent_session_id") REFERENCES "auth_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_replaced_by_session_id_fkey"
    FOREIGN KEY ("replaced_by_session_id") REFERENCES "auth_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
