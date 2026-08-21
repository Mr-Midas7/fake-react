-- Fix ON CONFLICT target for date-specific schedule upserts.
-- Problem: crew_schedules_date_override_idx was a PARTIAL unique index
-- (WHERE schedule_date IS NOT NULL), which Postgres cannot use for ON CONFLICT.
--
-- Solution:
--  1. Replace the partial date_override index with a NON-PARTIAL unique index
--     on (crew_id, schedule_date).  Postgres treats NULL as distinct in unique
--     indexes, so multiple weekly schedules (NULL schedule_date) per crew_id
--     are still allowed.
--  2. Replace the table-level UNIQUE (crew_id, day_of_week) with a PARTIAL
--     unique index that only covers weekly schedules (schedule_date IS NULL).
--     This allows date-specific overrides to coexist with weekly schedules
--     even when they share the same day_of_week.

-- Step 1: Drop the table-level unique constraint (auto-generated index)
ALTER TABLE public.crew_schedules
  DROP CONSTRAINT IF EXISTS crew_schedules_crew_id_day_of_week_key;

-- Step 1a: Create partial unique index for weekly schedules only
CREATE UNIQUE INDEX IF NOT EXISTS crew_schedules_weekly_unique
  ON public.crew_schedules (crew_id, day_of_week)
  WHERE schedule_date IS NULL;

-- Step 2: Drop the old PARTIAL date_override index
DROP INDEX IF EXISTS crew_schedules_date_override_idx;

-- Step 2a: Create NON-PARTIAL unique index for date-specific schedules.
-- NULL schedule_date values are treated as distinct, so weekly schedules
-- (NULL) are allowed to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS crew_schedules_date_override_idx
  ON public.crew_schedules (crew_id, schedule_date);
