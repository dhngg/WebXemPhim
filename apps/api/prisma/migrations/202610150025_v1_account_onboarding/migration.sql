-- Additive onboarding tables. Existing workspace memberships and resources are untouched.
ALTER TABLE "tenant_user_links" ALTER COLUMN "link_request_id" DROP NOT NULL;
ALTER TABLE "tenant_user_links" ADD COLUMN "invitation_id" UUID;
CREATE UNIQUE INDEX "tenant_user_links_invitation_id_key" ON "tenant_user_links" ("invitation_id");
CREATE TYPE "landlord_application_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "landlord_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "status" "landlord_application_status" NOT NULL DEFAULT 'PENDING',
  "reason" VARCHAR(1000) NOT NULL,
  "decision_note" VARCHAR(1000),
  "decided_by_user_id" UUID,
  "decided_at" TIMESTAMPTZ(6),
  "workspace_created_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "landlord_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "landlord_applications_decision_check" CHECK (
    ("status" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL AND "decision_note" IS NULL)
    OR ("status" <> 'PENDING' AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL)
  ),
  CONSTRAINT "landlord_applications_reason_check" CHECK (BTRIM("reason") <> ''),
  CONSTRAINT "landlord_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "landlord_applications_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "landlord_applications_one_pending_per_user_key" ON "landlord_applications" ("user_id") WHERE "status" = 'PENDING';
CREATE INDEX "landlord_applications_user_created_idx" ON "landlord_applications" ("user_id", "created_at" DESC);
CREATE INDEX "landlord_applications_status_created_idx" ON "landlord_applications" ("status", "created_at" DESC);

CREATE TABLE "tenant_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "token_hash" BYTEA NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "accepted_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_invitations_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "tenant_invitations_acceptance_check" CHECK (("accepted_at" IS NULL) = ("accepted_by_user_id" IS NULL)),
  CONSTRAINT "tenant_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenant_invitations_tenant_id_workspace_id_fkey" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "tenants"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenant_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenant_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "tenant_invitations_tenant_expires_idx" ON "tenant_invitations" ("tenant_id", "expires_at");
CREATE INDEX "tenant_invitations_acceptor_idx" ON "tenant_invitations" ("accepted_by_user_id", "accepted_at");
ALTER TABLE "tenant_user_links" ADD CONSTRAINT "tenant_user_links_invitation_id_fkey"
  FOREIGN KEY ("invitation_id") REFERENCES "tenant_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_user_links" ADD CONSTRAINT "tenant_user_links_source_check"
  CHECK (("link_request_id" IS NOT NULL) <> ("invitation_id" IS NOT NULL));
