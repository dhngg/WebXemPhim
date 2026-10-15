-- BE-CONTRACT-DATES-02 (REVIEW-ONLY, not deployed): date-based contract effectiveness.
--
-- Contracts keep the two stored states ACTIVE / ENDED. The contracts_active_room_period_excl
-- exclusion constraint (inclusive daterange per room, ACTIVE rows only) is unchanged and remains the
-- only authority on overlapping periods, including concurrent requests.
--
-- Only the room guard changes. Before: an OCCUPIED room could not leave OCCUPIED while ANY ACTIVE
-- contract existed, which assumed ACTIVE == tenant already in the room. Now an ACTIVE contract may be
-- in the future (it only reserves its period), so:
--   * ARCHIVED stays forbidden while any ACTIVE contract exists (future ones included);
--   * VACANT / UNAVAILABLE are forbidden only while an ACTIVE contract has STARTED
--     (start_date <= today in Asia/Ho_Chi_Minh), whatever the stored flag was before. This also
--     covers a room whose stored flag is still VACANT because no job flips it when a contract starts.
-- Room status values and the contracts table are not altered; no data is rewritten.
CREATE OR REPLACE FUNCTION "protect_active_contract_room_state"()
RETURNS trigger AS $$
DECLARE
  business_today date := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NEW."status" = 'ARCHIVED'
     AND EXISTS (SELECT 1 FROM "contracts" c WHERE c."room_id" = OLD."id" AND c."status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'room with an active contract cannot be archived';
  END IF;

  IF NEW."status" IN ('VACANT', 'UNAVAILABLE')
     AND EXISTS (
       SELECT 1 FROM "contracts" c
       WHERE c."room_id" = OLD."id" AND c."status" = 'ACTIVE' AND c."start_date" <= business_today
     ) THEN
    RAISE EXCEPTION 'room with a started active contract must remain occupied';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
