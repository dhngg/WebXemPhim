-- P03-01 building database foundation.
-- Created for review only; it has not been applied to Neon.

BEGIN;

CREATE TYPE "building_status" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "building_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "address_line_1" VARCHAR(200) NOT NULL,
    "address_line_2" VARCHAR(200),
    "ward" VARCHAR(100),
    "district" VARCHAR(100),
    "city" VARCHAR(100) NOT NULL,
    "postal_code" VARCHAR(20),
    "country_code" CHAR(2) NOT NULL DEFAULT 'VN',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(10,6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "buildings_name_trimmed_nonempty_check"
        CHECK ("name" = btrim("name") AND char_length("name") > 0),
    CONSTRAINT "buildings_address_line_1_trimmed_nonempty_check"
        CHECK ("address_line_1" = btrim("address_line_1") AND char_length("address_line_1") > 0),
    CONSTRAINT "buildings_city_trimmed_nonempty_check"
        CHECK ("city" = btrim("city") AND char_length("city") > 0),
    CONSTRAINT "buildings_country_code_check"
        CHECK ("country_code" = 'VN'),
    CONSTRAINT "buildings_archive_state_check"
        CHECK (
            ("status" = 'ACTIVE' AND "archived_at" IS NULL) OR
            ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
        ),
    CONSTRAINT "buildings_coordinates_pair_check"
        CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
    CONSTRAINT "buildings_latitude_range_check"
        CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
    CONSTRAINT "buildings_longitude_range_check"
        CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
);

CREATE INDEX "buildings_workspace_id_idx"
    ON "buildings"("workspace_id");

CREATE INDEX "buildings_workspace_id_city_district_idx"
    ON "buildings"("workspace_id", "city", "district");

ALTER TABLE "buildings"
    ADD CONSTRAINT "buildings_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_building_hard_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'buildings must be archived, not deleted'
        USING ERRCODE = '23514',
              CONSTRAINT = 'buildings_no_hard_delete_check';
END;
$$;

CREATE TRIGGER "buildings_no_hard_delete_trigger"
BEFORE DELETE ON "buildings"
FOR EACH ROW
EXECUTE FUNCTION "prevent_building_hard_delete"();

COMMIT;
