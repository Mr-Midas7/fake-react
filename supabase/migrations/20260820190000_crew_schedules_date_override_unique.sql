-- Add partial unique index for date-specific schedule overrides
-- Weekly schedules (schedule_date IS NULL) use the existing UNIQUE (crew_id, day_of_week)
-- Date-specific overrides (schedule_date IS NOT NULL) use this new partial unique index

CREATE UNIQUE INDEX IF NOT EXISTS crew_schedules_date_override_idx
ON public.crew_schedules (crew_id, schedule_date)
WHERE schedule_date IS NOT NULL;
