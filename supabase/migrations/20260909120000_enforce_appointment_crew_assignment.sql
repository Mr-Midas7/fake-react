-- Confirmed appointments are assigned to a free, scheduled crew member unless
-- an administrator has explicitly selected a crew option (including Unassigned).
DROP FUNCTION IF EXISTS public.update_appointment_details_atomic(
  uuid, uuid[], date, time, uuid, text, text
);

CREATE FUNCTION public.update_appointment_details_atomic(
  p_appointment_id uuid,
  p_service_ids uuid[],
  p_appointment_date date,
  p_start_time time,
  p_assigned_crew_id uuid,
  p_crew_assignment_manual boolean,
  p_status text,
  p_admin_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_service_count integer;
  v_total_estimate numeric(10,2);
  v_duration_minutes integer;
  v_assigned_crew_id uuid := p_assigned_crew_id;
BEGIN
  IF COALESCE(cardinality(p_service_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one service.';
  END IF;

  IF p_status NOT IN (
    'pending', 'confirmed', 'in_progress', 'completed', 'rescheduled', 'cancelled', 'rejected', 'no_show'
  ) THEN
    RAISE EXCEPTION 'Choose a valid appointment status.';
  END IF;

  SELECT count(*)
    INTO v_service_count
  FROM public.services
  WHERE id = ANY(p_service_ids)
    AND is_active = true
    AND is_archived = false;

  IF v_service_count <> cardinality(p_service_ids) THEN
    RAISE EXCEPTION 'One or more selected services are no longer available.';
  END IF;

  SELECT
    COALESCE(sum(price), 0),
    COALESCE(sum(duration_minutes), 0) + 30
  INTO v_total_estimate, v_duration_minutes
  FROM public.services
  WHERE id = ANY(p_service_ids);

  -- When confirming without a manual crew choice, select the first active
  -- mechanic whose scheduled shift, exceptions and current appointments allow
  -- the entire service period.
  IF p_status = 'confirmed' AND v_assigned_crew_id IS NULL AND NOT p_crew_assignment_manual THEN
    SELECT crew.id
      INTO v_assigned_crew_id
    FROM public.crew_members AS crew
    WHERE crew.is_active = true
      AND crew.is_archived = false
      AND EXISTS (
        SELECT 1
        FROM public.crew_schedules AS schedule
        WHERE schedule.crew_id = crew.id
          AND schedule.schedule_date = p_appointment_date
          AND schedule.is_working = true
          AND schedule.start_time IS NOT NULL
          AND schedule.end_time IS NOT NULL
          AND schedule.start_time <= p_start_time
          AND schedule.end_time >= p_start_time + make_interval(mins => v_duration_minutes)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.crew_availability_exceptions AS exception
        WHERE exception.crew_id = crew.id
          AND exception.start_date <= p_appointment_date
          AND exception.end_date >= p_appointment_date
          AND (
            exception.is_all_day = true
            OR (
              exception.start_time IS NOT NULL
              AND exception.end_time IS NOT NULL
              AND tsrange(
                p_appointment_date + p_start_time,
                p_appointment_date + p_start_time + make_interval(mins => v_duration_minutes),
                '[)'
              ) && tsrange(
                p_appointment_date + exception.start_time,
                p_appointment_date + exception.end_time,
                '[)'
              )
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.appointments AS appointment
        WHERE appointment.id <> p_appointment_id
          AND appointment.assigned_crew_id = crew.id
          AND appointment.appointment_date = p_appointment_date
          AND appointment.is_archived = false
          AND appointment.rescheduled_to_appointment_id IS NULL
          AND appointment.status IN ('pending', 'confirmed', 'in_progress', 'rescheduled')
          AND tsrange(
            appointment.appointment_date + appointment.start_time,
            appointment.appointment_date + appointment.start_time
              + make_interval(mins => appointment.booking_duration_minutes),
            '[)'
          ) && tsrange(
            p_appointment_date + p_start_time,
            p_appointment_date + p_start_time + make_interval(mins => v_duration_minutes),
            '[)'
          )
      )
    ORDER BY crew.name, crew.id
    LIMIT 1;

    IF v_assigned_crew_id IS NULL THEN
      RAISE EXCEPTION 'No crew member is available for the selected appointment period.';
    END IF;
  END IF;

  -- Manual crew assignments must meet those exact same availability rules.
  IF v_assigned_crew_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.crew_members AS crew
    WHERE crew.id = v_assigned_crew_id
      AND crew.is_active = true
      AND crew.is_archived = false
      AND EXISTS (
        SELECT 1
        FROM public.crew_schedules AS schedule
        WHERE schedule.crew_id = crew.id
          AND schedule.schedule_date = p_appointment_date
          AND schedule.is_working = true
          AND schedule.start_time IS NOT NULL
          AND schedule.end_time IS NOT NULL
          AND schedule.start_time <= p_start_time
          AND schedule.end_time >= p_start_time + make_interval(mins => v_duration_minutes)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.crew_availability_exceptions AS exception
        WHERE exception.crew_id = crew.id
          AND exception.start_date <= p_appointment_date
          AND exception.end_date >= p_appointment_date
          AND (
            exception.is_all_day = true
            OR (
              exception.start_time IS NOT NULL
              AND exception.end_time IS NOT NULL
              AND tsrange(
                p_appointment_date + p_start_time,
                p_appointment_date + p_start_time + make_interval(mins => v_duration_minutes),
                '[)'
              ) && tsrange(
                p_appointment_date + exception.start_time,
                p_appointment_date + exception.end_time,
                '[)'
              )
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.appointments AS appointment
        WHERE appointment.id <> p_appointment_id
          AND appointment.assigned_crew_id = crew.id
          AND appointment.appointment_date = p_appointment_date
          AND appointment.is_archived = false
          AND appointment.rescheduled_to_appointment_id IS NULL
          AND appointment.status IN ('pending', 'confirmed', 'in_progress', 'rescheduled')
          AND tsrange(
            appointment.appointment_date + appointment.start_time,
            appointment.appointment_date + appointment.start_time
              + make_interval(mins => appointment.booking_duration_minutes),
            '[)'
          ) && tsrange(
            p_appointment_date + p_start_time,
            p_appointment_date + p_start_time + make_interval(mins => v_duration_minutes),
            '[)'
          )
      )
  ) THEN
    RAISE EXCEPTION 'Choose a crew member who is free for the full appointment period.';
  END IF;

  UPDATE public.appointments
  SET appointment_date = p_appointment_date,
      start_time = p_start_time,
      assigned_crew_id = v_assigned_crew_id,
      status = p_status,
      admin_notes = NULLIF(btrim(p_admin_notes), ''),
      total_estimate = v_total_estimate,
      booking_duration_minutes = v_duration_minutes
  WHERE id = p_appointment_id
    AND is_archived = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This appointment is no longer available.';
  END IF;

  DELETE FROM public.appointment_services
  WHERE appointment_id = p_appointment_id;

  INSERT INTO public.appointment_services (
    appointment_id,
    service_id,
    service_name,
    price,
    duration_minutes
  )
  SELECT
    p_appointment_id,
    service.id,
    service.name,
    service.price,
    service.duration_minutes
  FROM public.services AS service
  WHERE service.id = ANY(p_service_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment_details_atomic(
  uuid, uuid[], date, time, uuid, boolean, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_appointment_details_atomic(
  uuid, uuid[], date, time, uuid, boolean, text, text
) TO authenticated;
