-- A booking reserves the selected service work plus one 15-minute arrival
-- buffer and one 15-minute post-service buffer, regardless of service count.
ALTER TABLE public.appointments
  ALTER COLUMN booking_duration_minutes SET DEFAULT 90;

UPDATE public.appointments appointments
SET booking_duration_minutes = COALESCE(
  (
    SELECT SUM(COALESCE(appointment_services.duration_minutes, 60)) + 30
    FROM public.appointment_services
    WHERE appointment_services.appointment_id = appointments.id
  ),
  90
)
WHERE appointments.is_archived = false
  AND appointments.appointment_date >= CURRENT_DATE
  AND appointments.status IN ('pending', 'confirmed', 'in_progress');

COMMENT ON COLUMN public.appointments.booking_duration_minutes IS
  'Selected service duration plus a 15-minute arrival buffer and a 15-minute post-service buffer.';
