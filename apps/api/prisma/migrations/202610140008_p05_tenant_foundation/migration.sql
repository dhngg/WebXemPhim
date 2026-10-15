CREATE TYPE "tenant_status" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(254),
    "date_of_birth" DATE,
    "address" VARCHAR(500),
    "notes" TEXT,
    "status" "tenant_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenants_full_name_not_blank_check" CHECK (length(btrim("full_name")) > 0),
    CONSTRAINT "tenants_phone_format_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+?[0-9]{7,15}$'),
    CONSTRAINT "tenants_email_normalized_check" CHECK (
        "email" IS NULL OR (length(btrim("email")) > 0 AND "email" = lower(btrim("email")))
    ),
    CONSTRAINT "tenants_archive_state_check" CHECK (
        ("status" = 'ACTIVE' AND "archived_at" IS NULL)
        OR
        ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
    )
);

CREATE INDEX "tenants_workspace_status_full_name_idx"
ON "tenants"("workspace_id", "status", "full_name");
CREATE INDEX "tenants_workspace_phone_idx" ON "tenants"("workspace_id", "phone");
CREATE INDEX "tenants_workspace_email_idx" ON "tenants"("workspace_id", "email");

ALTER TABLE "tenants"
ADD CONSTRAINT "tenants_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "prevent_tenant_hard_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tenant profiles cannot be hard-deleted; archive them instead'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tenants_prevent_hard_delete"
BEFORE DELETE ON "tenants"
FOR EACH ROW EXECUTE FUNCTION "prevent_tenant_hard_delete"();
