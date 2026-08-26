-- Persist appointment durations so availability remains correct even if a
-- service is later edited or archived.
ALTER TABLE public.appointment_services
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60
  CHECK (duration_minutes > 0);

UPDATE public.appointment_services aps
SET duration_minutes = services.duration_minutes
FROM public.services services
WHERE aps.service_id = services.id;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_duration_minutes integer NOT NULL DEFAULT 75
  CHECK (booking_duration_minutes > 0);

UPDATE public.appointments appointments
SET booking_duration_minutes = COALESCE(
  (
    SELECT SUM(aps.duration_minutes + 15)
    FROM public.appointment_services aps
    WHERE aps.appointment_id = appointments.id
  ),
  75
);

-- An atomic database guard prevents two final availability checks from booking
-- the same crew member into overlapping time ranges.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_crew_time_no_overlap;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_crew_time_no_overlap
  EXCLUDE USING gist (
    assigned_crew_id WITH =,
    tsrange(
      appointment_date + start_time,
      appointment_date + start_time + make_interval(mins => booking_duration_minutes),
      '[)'
    ) WITH &&
  )
  WHERE (
    is_archived = false
    AND status IN ('pending', 'confirmed', 'in_progress')
  );
