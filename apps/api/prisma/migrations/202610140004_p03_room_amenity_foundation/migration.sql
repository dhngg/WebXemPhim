-- P03-05 room and amenity foundation. Review-only; not applied to Neon.

BEGIN;

CREATE TYPE "room_status" AS ENUM ('VACANT', 'OCCUPIED', 'UNAVAILABLE', 'ARCHIVED');

CREATE UNIQUE INDEX "buildings_id_workspace_id_key" ON "buildings"("id", "workspace_id");

CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "area_sqm" DECIMAL(10,2) NOT NULL,
    "monthly_rent" DECIMAL(14,2) NOT NULL,
    "max_occupants" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "status" "room_status" NOT NULL DEFAULT 'VACANT',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rooms_code_normalized_check" CHECK ("code" = upper(btrim("code")) AND char_length("code") > 0),
    CONSTRAINT "rooms_area_sqm_positive_check" CHECK ("area_sqm" > 0),
    CONSTRAINT "rooms_monthly_rent_nonnegative_check" CHECK ("monthly_rent" >= 0),
    CONSTRAINT "rooms_max_occupants_positive_check" CHECK ("max_occupants" > 0),
    CONSTRAINT "rooms_archive_state_check" CHECK (
        ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL) OR
        ("status" <> 'ARCHIVED' AND "archived_at" IS NULL)
    )
);

CREATE TABLE "amenities" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "amenities_name_normalized_check" CHECK ("name" = btrim("name") AND char_length("name") > 0)
);

CREATE TABLE "room_amenities" (
    "room_id" UUID NOT NULL,
    "amenity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_amenities_pkey" PRIMARY KEY ("room_id", "amenity_id")
);

CREATE UNIQUE INDEX "rooms_id_workspace_id_key" ON "rooms"("id", "workspace_id");
CREATE UNIQUE INDEX "rooms_building_id_code_key" ON "rooms"("building_id", "code");
CREATE INDEX "rooms_workspace_id_status_idx" ON "rooms"("workspace_id", "status");
CREATE INDEX "rooms_building_id_status_idx" ON "rooms"("building_id", "status");
CREATE UNIQUE INDEX "amenities_id_workspace_id_key" ON "amenities"("id", "workspace_id");
CREATE UNIQUE INDEX "amenities_workspace_id_name_key" ON "amenities"("workspace_id", "name");
CREATE INDEX "room_amenities_amenity_id_idx" ON "room_amenities"("amenity_id");

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_workspace_id_fkey"
    FOREIGN KEY ("building_id", "workspace_id") REFERENCES "buildings"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_amenity_id_fkey"
    FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "assert_room_amenity_same_workspace"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "rooms" r
        JOIN "amenities" a ON a."id" = NEW."amenity_id"
        WHERE r."id" = NEW."room_id" AND r."workspace_id" = a."workspace_id"
    ) THEN
        RAISE EXCEPTION 'room and amenity must belong to the same workspace'
            USING ERRCODE = '23514', CONSTRAINT = 'room_amenities_same_workspace_check';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "room_amenities_same_workspace_trigger"
BEFORE INSERT OR UPDATE ON "room_amenities"
FOR EACH ROW EXECUTE FUNCTION "assert_room_amenity_same_workspace"();

CREATE FUNCTION "prevent_room_hard_delete"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'rooms must be archived, not deleted'
        USING ERRCODE = '23514', CONSTRAINT = 'rooms_no_hard_delete_check';
END;
$$;
CREATE TRIGGER "rooms_no_hard_delete_trigger" BEFORE DELETE ON "rooms"
FOR EACH ROW EXECUTE FUNCTION "prevent_room_hard_delete"();

COMMIT;
