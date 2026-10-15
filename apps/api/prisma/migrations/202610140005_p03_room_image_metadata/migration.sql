-- Room images store externally hosted URLs and presentation metadata only.
-- No image binary or storage-provider credential is persisted in PostgreSQL.
CREATE TABLE "room_images" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "alt_text" VARCHAR(200),
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "room_images_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_images_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "room_images_url_not_blank_check" CHECK (length(btrim("url")) > 0)
);

CREATE INDEX "room_images_workspace_id_idx" ON "room_images"("workspace_id");
CREATE INDEX "room_images_room_id_sort_order_id_idx" ON "room_images"("room_id", "sort_order", "id");

ALTER TABLE "room_images"
ADD CONSTRAINT "room_images_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "room_images"
ADD CONSTRAINT "room_images_room_id_workspace_id_fkey"
FOREIGN KEY ("room_id", "workspace_id") REFERENCES "rooms"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
