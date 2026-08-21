-- Extend crew_schedules to support specific date scheduling (for one-off schedule overrides)
ALTER TABLE public.crew_schedules
  ADD COLUMN IF NOT EXISTS schedule_date date,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date;

-- Index for efficient date-specific schedule lookups
CREATE INDEX IF NOT EXISTS crew_schedules_date_idx ON public.crew_schedules (schedule_date);
CREATE INDEX IF NOT EXISTS crew_schedules_effective_idx ON public.crew_schedules (effective_from, effective_to);

COMMENT ON COLUMN public.crew_schedules.schedule_date IS 'Specific date for one-off schedule override. If NULL, the schedule is a weekly recurring pattern based on day_of_week.';
COMMENT ON COLUMN public.crew_schedules.effective_from IS 'Start of a date range during which this weekly pattern is active. If NULL, always active.';
COMMENT ON COLUMN public.crew_schedules.effective_to IS 'End of a date range during which this weekly pattern is active. If NULL, no end date.';
