-- Add note column to crew_schedules for schedule-specific notes (e.g., "unavailable" status)
ALTER TABLE public.crew_schedules ADD COLUMN IF NOT EXISTS note text;
COMMENT ON COLUMN public.crew_schedules.note IS 'Optional note for the schedule entry, e.g. reason for unavailability.';
