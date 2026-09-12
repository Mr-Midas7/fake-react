-- Keep the current appointment reserved while a customer-requested move is
-- reviewed. The target date/time becomes real only after an administrator
-- confirms it.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS pending_reschedule_request_id uuid,
  ADD COLUMN IF NOT EXISTS pending_reschedule_date date,
  ADD COLUMN IF NOT EXISTS pending_reschedule_start_time time,
  ADD COLUMN IF NOT EXISTS pending_reschedule_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_pending_reschedule_request_id_unique
  ON public.appointments (pending_reschedule_request_id)
  WHERE pending_reschedule_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_reschedule_request(
  p_appointment_id uuid,
  p_request_id uuid,
  p_appointment_date date,
  p_start_time time,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_appointment_date IS NULL OR p_start_time IS NULL
     OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A date, time, and rescheduling reason are required.';
  END IF;

  SELECT appointment.*
    INTO v_appointment
  FROM public.appointments AS appointment
  WHERE appointment.id = p_appointment_id
    AND appointment.is_archived = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This appointment is no longer available.';
  END IF;

  IF v_appointment.pending_reschedule_request_id = p_request_id THEN
    RETURN;
  END IF;
  IF v_appointment.pending_reschedule_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'A reschedule request is already awaiting review.';
  END IF;
  IF v_appointment.status NOT IN ('pending', 'confirmed')
     OR v_appointment.rescheduled_to_appointment_id IS NOT NULL THEN
    RAISE EXCEPTION 'This appointment can no longer be rescheduled.';
  END IF;

  UPDATE public.appointments
  SET pending_reschedule_request_id = p_request_id,
      pending_reschedule_date = p_appointment_date,
      pending_reschedule_start_time = p_start_time,
      pending_reschedule_reason = NULLIF(btrim(p_reason), '')
  WHERE id = v_appointment.id;

  INSERT INTO public.notifications (type, title, message, appointment_id)
  VALUES (
    'reschedule_request',
    'Reschedule request ' || v_appointment.reference_code,
    v_appointment.customer_name || ' requested ' || to_char(p_appointment_date, 'Mon FMDD, YYYY')
      || ' at ' || to_char(p_start_time, 'HH12:MI AM') || '. Reason: ' || btrim(p_reason),
    v_appointment.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_reschedule_request(
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
    RAISE EXCEPTION 'Only administrators can review reschedule requests.';
  END IF;
  IF lower(btrim(COALESCE(p_decision, ''))) NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Choose either confirmed or rejected.';
  END IF;

  SELECT appointment.*
    INTO v_appointment
  FROM public.appointments AS appointment
  WHERE appointment.id = p_appointment_id
    AND appointment.is_archived = false
  FOR UPDATE;

  IF NOT FOUND OR v_appointment.pending_reschedule_request_id IS NULL THEN
    RAISE EXCEPTION 'This reschedule request is no longer available.';
  END IF;

  IF lower(btrim(p_decision)) = 'rejected' THEN
    UPDATE public.appointments
    SET pending_reschedule_request_id = NULL,
        pending_reschedule_date = NULL,
        pending_reschedule_start_time = NULL,
        pending_reschedule_reason = NULL
    WHERE id = v_appointment.id;
    RETURN;
  END IF;

  v_duration_minutes := COALESCE(v_appointment.booking_duration_minutes, 75);

  IF EXISTS (
    SELECT 1
    FROM public.schedule_blocks AS block
    WHERE block.block_date = v_appointment.pending_reschedule_date
      AND block.is_active = true
      AND (
        block.start_time IS NULL
        OR (
          block.start_time IS NOT NULL
          AND (
            (COALESCE(block.reason, '') NOT LIKE 'RANGE:%'
              AND block.start_time = v_appointment.pending_reschedule_start_time)
            OR (COALESCE(block.reason, '') LIKE 'RANGE:%'
              AND tsrange(
                v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time,
                v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time
                  + make_interval(mins => v_duration_minutes),
                '[)'
              ) && tsrange(
                v_appointment.pending_reschedule_date + block.start_time,
                v_appointment.pending_reschedule_date
                  + substring(block.reason FROM '^RANGE:([0-9]{2}:[0-9]{2})')::time,
                '[)'
              ))
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'The requested time is no longer available because the shop schedule is blocked.';
  END IF;

  SELECT crew.id
    INTO v_assigned_crew_id
  FROM public.crew_members AS crew
  WHERE crew.is_active = true
    AND crew.is_archived = false
    AND EXISTS (
      SELECT 1
      FROM public.time_slots AS slot
      WHERE slot.is_active = true
        AND slot.start_time = v_appointment.pending_reschedule_start_time
        AND slot.capacity > (
          SELECT count(*)
          FROM public.appointments AS other
          WHERE other.id <> v_appointment.id
            AND other.appointment_date = v_appointment.pending_reschedule_date
            AND other.is_archived = false
            AND other.rescheduled_to_appointment_id IS NULL
            AND other.status IN ('pending', 'confirmed', 'in_progress', 'rescheduled')
            AND tsrange(
              other.appointment_date + other.start_time,
              other.appointment_date + other.start_time
                + make_interval(mins => COALESCE(other.booking_duration_minutes, 75)), '[)'
            ) && tsrange(
              v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time,
              v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time
                + make_interval(mins => v_duration_minutes), '[)'
            )
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.crew_schedules AS schedule
      WHERE schedule.crew_id = crew.id
        AND schedule.schedule_date = v_appointment.pending_reschedule_date
        AND schedule.is_working = true
        AND schedule.start_time <= v_appointment.pending_reschedule_start_time
        AND schedule.end_time >= v_appointment.pending_reschedule_start_time
          + make_interval(mins => v_duration_minutes)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_availability_exceptions AS exception
      WHERE exception.crew_id = crew.id
        AND exception.start_date <= v_appointment.pending_reschedule_date
        AND exception.end_date >= v_appointment.pending_reschedule_date
        AND (exception.is_all_day OR (
          exception.start_time IS NOT NULL AND exception.end_time IS NOT NULL
          AND tsrange(
            v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time,
            v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time
              + make_interval(mins => v_duration_minutes), '[)'
          ) && tsrange(
            v_appointment.pending_reschedule_date + exception.start_time,
            v_appointment.pending_reschedule_date + exception.end_time, '[)'
          )
        ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments AS other
      WHERE other.id <> v_appointment.id
        AND other.assigned_crew_id = crew.id
        AND other.appointment_date = v_appointment.pending_reschedule_date
        AND other.is_archived = false
        AND other.rescheduled_to_appointment_id IS NULL
        AND other.status IN ('pending', 'confirmed', 'in_progress', 'rescheduled')
        AND tsrange(
          other.appointment_date + other.start_time,
          other.appointment_date + other.start_time
            + make_interval(mins => COALESCE(other.booking_duration_minutes, 75)), '[)'
        ) && tsrange(
          v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time,
          v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time
            + make_interval(mins => v_duration_minutes), '[)'
        )
    )
  ORDER BY (crew.id = v_appointment.assigned_crew_id) DESC, crew.name, crew.id
  LIMIT 1;

  IF v_assigned_crew_id IS NULL THEN
    RAISE EXCEPTION 'No crew member is available for the requested appointment period.';
  END IF;

  UPDATE public.appointments
  SET appointment_date = v_appointment.pending_reschedule_date,
      start_time = v_appointment.pending_reschedule_start_time,
      assigned_crew_id = v_assigned_crew_id,
      status = 'confirmed',
      pending_reschedule_request_id = NULL,
      pending_reschedule_date = NULL,
      pending_reschedule_start_time = NULL,
      pending_reschedule_reason = NULL
  WHERE id = v_appointment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_reschedule_request(uuid, uuid, date, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_reschedule_request(uuid, uuid, date, time, text) TO service_role;
REVOKE ALL ON FUNCTION public.review_reschedule_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_reschedule_request(uuid, text) TO authenticated;
