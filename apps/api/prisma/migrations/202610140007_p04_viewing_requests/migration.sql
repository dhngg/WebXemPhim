CREATE TYPE "viewing_request_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

CREATE UNIQUE INDEX "listings_id_workspace_id_key" ON "listings"("id", "workspace_id");

CREATE TABLE "viewing_requests" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "requester_user_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "message" VARCHAR(1000),
    "status" "viewing_request_status" NOT NULL DEFAULT 'PENDING',
    "decision_note" VARCHAR(1000),
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "viewing_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "viewing_requests_future_schedule_check" CHECK ("scheduled_at" > "created_at"),
    CONSTRAINT "viewing_requests_state_metadata_check" CHECK (
        ("status" = 'PENDING' AND "decided_by_user_id" IS NULL AND "decided_at" IS NULL AND "cancelled_at" IS NULL)
        OR
        ("status" IN ('CONFIRMED', 'REJECTED') AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL AND "cancelled_at" IS NULL)
        OR
        ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
    )
);

CREATE INDEX "viewing_requests_requester_status_scheduled_idx"
ON "viewing_requests"("requester_user_id", "status", "scheduled_at");
CREATE INDEX "viewing_requests_workspace_status_scheduled_idx"
ON "viewing_requests"("workspace_id", "status", "scheduled_at");
CREATE INDEX "viewing_requests_listing_scheduled_idx"
ON "viewing_requests"("listing_id", "scheduled_at");
CREATE UNIQUE INDEX "viewing_requests_active_schedule_key"
ON "viewing_requests"("requester_user_id", "listing_id", "scheduled_at")
WHERE "status" IN ('PENDING', 'CONFIRMED');

ALTER TABLE "viewing_requests"
ADD CONSTRAINT "viewing_requests_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "viewing_requests"
ADD CONSTRAINT "viewing_requests_listing_id_workspace_id_fkey"
FOREIGN KEY ("listing_id", "workspace_id") REFERENCES "listings"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "viewing_requests"
ADD CONSTRAINT "viewing_requests_requester_user_id_fkey"
FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "viewing_requests"
ADD CONSTRAINT "viewing_requests_decided_by_user_id_fkey"
FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
