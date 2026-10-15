CREATE TYPE "tenant_link_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_id_workspace_id_key" UNIQUE ("id", "workspace_id");

CREATE TABLE "tenant_link_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "requester_user_id" UUID NOT NULL,
    "status" "tenant_link_request_status" NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(500),
    "decision_note" VARCHAR(500),
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "tenant_link_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_link_requests_decision_check" CHECK (
      ("status" = 'PENDING' AND "decided_by_user_id" IS NULL AND "decided_at" IS NULL)
      OR ("status" IN ('APPROVED', 'REJECTED') AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL)
    )
);

CREATE TABLE "tenant_user_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "link_request_id" UUID NOT NULL,
    "approved_by_user_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,
    "revoke_reason" VARCHAR(500),
    CONSTRAINT "tenant_user_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_user_links_link_request_id_key" UNIQUE ("link_request_id"),
    CONSTRAINT "tenant_user_links_revocation_check" CHECK (
      ("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL AND "revoke_reason" IS NULL)
      OR ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "tenant_link_requests_pending_tenant_key"
  ON "tenant_link_requests" ("tenant_id") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "tenant_link_requests_pending_user_workspace_key"
  ON "tenant_link_requests" ("requester_user_id", "workspace_id") WHERE "status" = 'PENDING';
CREATE INDEX "tenant_link_requests_requester_status_created_idx"
  ON "tenant_link_requests" ("requester_user_id", "status", "created_at");
CREATE INDEX "tenant_link_requests_workspace_status_created_idx"
  ON "tenant_link_requests" ("workspace_id", "status", "created_at");
CREATE INDEX "tenant_link_requests_tenant_status_idx"
  ON "tenant_link_requests" ("tenant_id", "status");

CREATE UNIQUE INDEX "tenant_user_links_active_tenant_key"
  ON "tenant_user_links" ("tenant_id") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "tenant_user_links_active_user_workspace_key"
  ON "tenant_user_links" ("user_id", "workspace_id") WHERE "revoked_at" IS NULL;
CREATE INDEX "tenant_user_links_user_revoked_idx"
  ON "tenant_user_links" ("user_id", "revoked_at");
CREATE INDEX "tenant_user_links_workspace_revoked_idx"
  ON "tenant_user_links" ("workspace_id", "revoked_at");
CREATE INDEX "tenant_user_links_tenant_revoked_idx"
  ON "tenant_user_links" ("tenant_id", "revoked_at");

ALTER TABLE "tenant_link_requests"
  ADD CONSTRAINT "tenant_link_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_link_requests_tenant_id_workspace_id_fkey" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "tenants"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_link_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_link_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_user_links"
  ADD CONSTRAINT "tenant_user_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_user_links_tenant_id_workspace_id_fkey" FOREIGN KEY ("tenant_id", "workspace_id") REFERENCES "tenants"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_user_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_user_links_link_request_id_fkey" FOREIGN KEY ("link_request_id") REFERENCES "tenant_link_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_user_links_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tenant_user_links_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
