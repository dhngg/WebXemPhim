-- P02-01 workspace and membership database foundation.
-- Applied to Neon development only by the separately approved P02-03 task.

BEGIN;

-- CreateEnum
CREATE TYPE "workspace_role" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "workspace_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "workspace_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspaces_name_trimmed_nonempty_check"
        CHECK ("name" = btrim("name") AND char_length("name") > 0),
    CONSTRAINT "workspaces_archive_state_check"
        CHECK (
            ("status" = 'ACTIVE' AND "archived_at" IS NULL) OR
            ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
        )
);

-- CreateTable
CREATE TABLE "workspace_memberships" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "workspace_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

-- One user has at most one membership and one role in each workspace.
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_user_id_key"
    ON "workspace_memberships"("workspace_id", "user_id");

-- Supports listing a user's workspaces.
CREATE INDEX "workspace_memberships_user_id_idx"
    ON "workspace_memberships"("user_id");

-- Supports workspace-scoped role checks and member filtering.
CREATE INDEX "workspace_memberships_workspace_id_role_idx"
    ON "workspace_memberships"("workspace_id", "role");

-- At most one OWNER is allowed immediately, including concurrent writes.
CREATE UNIQUE INDEX "workspace_memberships_one_owner_per_workspace_key"
    ON "workspace_memberships"("workspace_id")
    WHERE "role" = 'OWNER';

-- Memberships cannot outlive their workspace or user.
ALTER TABLE "workspace_memberships"
    ADD CONSTRAINT "workspace_memberships_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workspace_memberships"
    ADD CONSTRAINT "workspace_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every committed workspace must have exactly one OWNER. The deferred check
-- lets workspace creation and ownership transfer remain atomic while the
-- partial unique index above prevents two owners at any instant.
CREATE FUNCTION "assert_workspace_has_exactly_one_owner"("target_workspace_id" UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "workspaces" WHERE "id" = "target_workspace_id")
       AND (SELECT count(*) FROM "workspace_memberships"
            WHERE "workspace_id" = "target_workspace_id" AND "role" = 'OWNER') <> 1 THEN
        RAISE EXCEPTION 'workspace must have exactly one owner'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'workspace_memberships_exactly_one_owner_check';
    END IF;
END;
$$;

CREATE FUNCTION "check_workspace_owner_after_workspace_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM "assert_workspace_has_exactly_one_owner"(NEW."id");
    RETURN NULL;
END;
$$;

CREATE FUNCTION "check_workspace_owner_after_membership_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM "assert_workspace_has_exactly_one_owner"(NEW."workspace_id");
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM "assert_workspace_has_exactly_one_owner"(OLD."workspace_id");
        IF NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id" THEN
            PERFORM "assert_workspace_has_exactly_one_owner"(NEW."workspace_id");
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM "assert_workspace_has_exactly_one_owner"(OLD."workspace_id");
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "workspaces_exactly_one_owner_trigger"
AFTER INSERT ON "workspaces"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_workspace_owner_after_workspace_change"();

CREATE CONSTRAINT TRIGGER "workspace_memberships_exactly_one_owner_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_memberships"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_workspace_owner_after_membership_change"();

-- Workspaces are archived by updating status/archived_at. Hard delete is blocked.
CREATE FUNCTION "prevent_workspace_hard_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'workspaces must be archived, not deleted'
        USING ERRCODE = '23514',
              CONSTRAINT = 'workspaces_no_hard_delete_check';
END;
$$;

CREATE TRIGGER "workspaces_no_hard_delete_trigger"
BEFORE DELETE ON "workspaces"
FOR EACH ROW
EXECUTE FUNCTION "prevent_workspace_hard_delete"();

COMMIT;
