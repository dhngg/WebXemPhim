-- Step 1/2 of tenant maintenance cancellation. Adds the terminal CANCELLED status only.
-- It is its own migration because PostgreSQL cannot use a new enum value in the transaction that
-- adds it; the CHECK constraint and trigger that reference it are in the next migration.
-- No table is rewritten and no existing row is touched. Enum values cannot be removed afterwards.
ALTER TYPE "maintenance_status" ADD VALUE IF NOT EXISTS 'CANCELLED';
