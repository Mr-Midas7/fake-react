-- Allow NULL start_time/end_time for non-working schedule overrides
ALTER TABLE public.crew_schedules ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE public.crew_schedules ALTER COLUMN end_time DROP NOT NULL;
