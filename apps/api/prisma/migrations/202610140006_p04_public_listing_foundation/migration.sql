CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "unpublished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "listings_publication_state_check" CHECK (
        ("is_published" = true AND "published_at" IS NOT NULL AND "unpublished_at" IS NULL)
        OR
        ("is_published" = false AND "published_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "listings_room_id_key" ON "listings"("room_id");
CREATE UNIQUE INDEX "listings_room_id_workspace_id_key" ON "listings"("room_id", "workspace_id");
CREATE INDEX "listings_workspace_id_idx" ON "listings"("workspace_id");
CREATE INDEX "listings_publication_idx" ON "listings"("is_published", "published_at", "id");

ALTER TABLE "listings"
ADD CONSTRAINT "listings_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listings"
ADD CONSTRAINT "listings_room_id_workspace_id_fkey"
FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
