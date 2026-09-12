-- Allow administrators to approve or reject a pending appointment directly
-- from the notifications inbox. Confirmation revalidates the appointment's
-- crew assignment against the current schedule and availability rules.
CREATE OR REPLACE FUNCTION public.review_pending_appointment(
  p_appointment_id uuid,
  p_decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_assigned_crew_id uuid;
  v_duration_minutes integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can review appointments.';
  END IF;

  IF p_decision IS NULL OR lower(btrim(p_decision)) NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Choose either confirmed or rejected.';
  END IF;

  -- Lock the row so two notification actions cannot review the same booking.
  SELECT appointment.*
    INTO v_appointment
  FROM public.appointments AS appointment
  WHERE appointment.id = p_appointment_id
    AND appointment.is_archived = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This appointment is no longer available.';
  END IF;

  IF v_appointment.status <> 'pending' THEN
    RAISE EXCEPTION 'This appointment has already been reviewed.';
  END IF;

  IF lower(btrim(p_decision)) = 'rejected' THEN
    UPDATE public.appointments
    SET status = 'rejected',
        assigned_crew_id = NULL
    WHERE id = v_appointment.id;
    RETURN;
  END IF;

  v_duration_minutes := COALESCE(v_appointment.booking_duration_minutes, 75);

  -- Prefer the crew member reserved during booking, but fall back to another
  -- currently available member when schedules or availability have changed.
  SELECT crew.id
    INTO v_assigned_crew_id
  FROM public.crew_members AS crew
  WHERE crew.is_active = true
    AND crew.is_archived = false
    AND EXISTS (
      SELECT 1
      FROM public.crew_schedules AS schedule
      WHERE schedule.crew_id = crew.id
        AND schedule.schedule_date = v_appointment.appointment_date
        AND schedule.is_working = true
        AND schedule.start_time IS NOT NULL
        AND schedule.end_time IS NOT NULL
        AND schedule.start_time <= v_appointment.start_time
        AND schedule.end_time >= v_appointment.start_time + make_interval(mins => v_duration_minutes)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.crew_availability_exceptions AS exception
      WHERE exception.crew_id = crew.id
        AND exception.start_date <= v_appointment.appointment_date
        AND exception.end_date >= v_appointment.appointment_date
        AND (
          exception.is_all_day = true
          OR (
            exception.start_time IS NOT NULL
            AND exception.end_time IS NOT NULL
            AND tsrange(
              v_appointment.appointment_date + v_appointment.start_time,
              v_appointment.appointment_date + v_appointment.start_time
                + make_interval(mins => v_duration_minutes),
              '[)'
            ) && tsrange(
              v_appointment.appointment_date + exception.start_time,
              v_appointment.appointment_date + exception.end_time,
              '[)'
            )
          )
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointments AS other
      WHERE other.id <> v_appointment.id
        AND other.assigned_crew_id = crew.id
        AND other.appointment_date = v_appointment.appointment_date
        AND other.is_archived = false
        AND other.rescheduled_to_appointment_id IS NULL
        AND other.status IN ('pending', 'confirmed', 'in_progress', 'rescheduled')
        AND tsrange(
          other.appointment_date + other.start_time,
          other.appointment_date + other.start_time
            + make_interval(mins => COALESCE(other.booking_duration_minutes, 75)),
          '[)'
        ) && tsrange(
          v_appointment.appointment_date + v_appointment.start_time,
          v_appointment.appointment_date + v_appointment.start_time
            + make_interval(mins => v_duration_minutes),
          '[)'
        )
    )
  ORDER BY (crew.id = v_appointment.assigned_crew_id) DESC, crew.name, crew.id
  LIMIT 1;

  IF v_assigned_crew_id IS NULL THEN
    RAISE EXCEPTION 'No crew member is available for the selected appointment period.';
  END IF;

  UPDATE public.appointments
  SET status = 'confirmed',
      assigned_crew_id = v_assigned_crew_id
  WHERE id = v_appointment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_pending_appointment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_pending_appointment(uuid, text) TO authenticated;
