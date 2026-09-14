-- A customer-confirmed reschedule reserves a fresh replacement reference code.
-- Admin approval then uses that same code to create the linked booking while
-- preserving the original booking as audit history.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS pending_reschedule_reference_code text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_pending_reschedule_reference_code_unique
  ON public.appointments (pending_reschedule_reference_code)
  WHERE pending_reschedule_reference_code IS NOT NULL;

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
  v_reference_code text;
  v_reference_available boolean := false;
  v_attempt integer;
  v_character integer;
  v_reference_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
  IF v_appointment.pending_reschedule_request_id IS NOT NULL
     AND v_appointment.pending_reschedule_request_id <> p_request_id THEN
    RAISE EXCEPTION 'A reschedule request is already awaiting review.';
  END IF;
  IF v_appointment.reschedule_count >= 3 THEN
    RAISE EXCEPTION 'This appointment has reached the maximum of 3 reschedules.';
  END IF;
  IF v_appointment.status NOT IN ('pending', 'confirmed')
     OR v_appointment.rescheduled_to_appointment_id IS NOT NULL THEN
    RAISE EXCEPTION 'This appointment can no longer be rescheduled.';
  END IF;

  -- Preserve an existing reserved reference on a retry. Older pending requests
  -- without one receive a reservation the first time they are retried.
  v_reference_code := v_appointment.pending_reschedule_reference_code;
  IF v_reference_code IS NULL THEN
    FOR v_attempt IN 1..10 LOOP
      v_reference_code := 'FRM-';
      FOR v_character IN 1..6 LOOP
        v_reference_code := v_reference_code || substr(
          v_reference_alphabet,
          1 + floor(random() * length(v_reference_alphabet))::integer,
          1
        );
      END LOOP;

      SELECT NOT EXISTS (
        SELECT 1
        FROM public.appointments
        WHERE reference_code = v_reference_code
           OR pending_reschedule_reference_code = v_reference_code
      ) INTO v_reference_available;
      EXIT WHEN v_reference_available;
    END LOOP;

    IF NOT v_reference_available THEN
      RAISE EXCEPTION 'Could not generate a unique booking reference. Please try again.';
    END IF;
  END IF;

  UPDATE public.appointments
  SET pending_reschedule_request_id = p_request_id,
      pending_reschedule_date = p_appointment_date,
      pending_reschedule_start_time = p_start_time,
      pending_reschedule_reference_code = v_reference_code,
      pending_reschedule_reason = NULLIF(btrim(p_reason), '')
  WHERE id = v_appointment.id;

  IF v_appointment.pending_reschedule_request_id IS NULL THEN
    INSERT INTO public.notifications (type, title, message, appointment_id)
    VALUES (
      'reschedule_request',
      'Reschedule request ' || v_appointment.reference_code,
      v_appointment.customer_name || ' requested ' || to_char(p_appointment_date, 'Mon FMDD, YYYY')
        || ' at ' || to_char(p_start_time, 'HH12:MI AM') || '. New reference: '
        || v_reference_code || '. Reason: ' || btrim(p_reason),
      v_appointment.id
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_appointment_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
     OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    IF OLD.reschedule_count >= 3 THEN
      RAISE EXCEPTION 'This appointment has reached the maximum of 3 reschedules.';
    END IF;

    NEW.reschedule_count := OLD.reschedule_count + 1;
    NEW.last_reschedule_rejected_at := NULL;
    NEW.last_reschedule_rejection_message := NULL;
  ELSIF OLD.pending_reschedule_request_id IS NULL
     AND NEW.pending_reschedule_request_id IS NOT NULL THEN
    -- A fresh request replaces an earlier rejection notice.
    NEW.last_reschedule_rejected_at := NULL;
    NEW.last_reschedule_rejection_message := NULL;
  ELSIF OLD.pending_reschedule_request_id IS NOT NULL
     AND NEW.pending_reschedule_request_id IS NULL THEN
    IF NEW.status = 'rescheduled' AND NEW.rescheduled_to_appointment_id IS NOT NULL THEN
      -- Approval clears the pending fields while linking a new appointment; it
      -- must not be recorded as a rejected request.
      NEW.last_reschedule_rejected_at := NULL;
      NEW.last_reschedule_rejection_message := NULL;
    ELSE
      -- Rejecting a request leaves the original appointment unchanged.
      NEW.last_reschedule_rejected_at := now();
      NEW.last_reschedule_rejection_message :=
        'Reschedule Request Rejected. Your requested reschedule was not approved. Your original appointment remains unchanged and reserved.';
    END IF;
  END IF;

  RETURN NEW;
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
  v_new_appointment_id uuid;
  v_new_reference_code text;
  v_reason text;
  v_original_shop_notes text;
  v_new_shop_notes text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can review reschedule requests.';
  END IF;
  IF lower(btrim(COALESCE(p_decision, ''))) NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Choose either confirmed or rejected.';
  END IF;

  -- Lock the original request so it can produce at most one replacement.
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
        pending_reschedule_reference_code = NULL,
        pending_reschedule_reason = NULL
    WHERE id = v_appointment.id;
    RETURN;
  END IF;

  IF v_appointment.reschedule_count >= 3 THEN
    RAISE EXCEPTION 'This appointment has reached the maximum of 3 reschedules.';
  END IF;
  IF v_appointment.pending_reschedule_date IS NULL
     OR v_appointment.pending_reschedule_start_time IS NULL
     OR NULLIF(btrim(v_appointment.pending_reschedule_reason), '') IS NULL THEN
    RAISE EXCEPTION 'The reschedule request is missing its requested schedule or reason.';
  END IF;

  v_duration_minutes := COALESCE(v_appointment.booking_duration_minutes, 75);
  v_reason := btrim(v_appointment.pending_reschedule_reason);

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

  -- Re-check capacity, crew schedules, and crew availability immediately before
  -- creating the replacement booking.
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
                + make_interval(mins => COALESCE(other.booking_duration_minutes, 75)),
              '[)'
            ) && tsrange(
              v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time,
              v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time
                + make_interval(mins => v_duration_minutes),
              '[)'
            )
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.crew_schedules AS schedule
      WHERE schedule.crew_id = crew.id
        AND schedule.schedule_date = v_appointment.pending_reschedule_date
        AND schedule.is_working = true
        AND schedule.start_time <= v_appointment.pending_reschedule_start_time
        AND schedule.end_time >= v_appointment.pending_reschedule_start_time
          + make_interval(mins => v_duration_minutes)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.crew_availability_exceptions AS exception
      WHERE exception.crew_id = crew.id
        AND exception.start_date <= v_appointment.pending_reschedule_date
        AND exception.end_date >= v_appointment.pending_reschedule_date
        AND (exception.is_all_day OR (
          exception.start_time IS NOT NULL AND exception.end_time IS NOT NULL
          AND tsrange(
            v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time,
            v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time
              + make_interval(mins => v_duration_minutes),
            '[)'
          ) && tsrange(
            v_appointment.pending_reschedule_date + exception.start_time,
            v_appointment.pending_reschedule_date + exception.end_time,
            '[)'
          )
        ))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointments AS other
      WHERE other.id <> v_appointment.id
        AND other.assigned_crew_id = crew.id
        AND other.appointment_date = v_appointment.pending_reschedule_date
        AND other.is_archived = false
        AND other.rescheduled_to_appointment_id IS NULL
        AND other.status IN ('pending', 'confirmed', 'in_progress', 'rescheduled')
        AND tsrange(
          other.appointment_date + other.start_time,
          other.appointment_date + other.start_time
            + make_interval(mins => COALESCE(other.booking_duration_minutes, 75)),
          '[)'
        ) && tsrange(
          v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time,
          v_appointment.pending_reschedule_date + v_appointment.pending_reschedule_start_time
            + make_interval(mins => v_duration_minutes),
          '[)'
        )
    )
  ORDER BY (crew.id = v_appointment.assigned_crew_id) DESC, crew.name, crew.id
  LIMIT 1;

  IF v_assigned_crew_id IS NULL THEN
    RAISE EXCEPTION 'No crew member is available for the requested appointment period.';
  END IF;

  -- The customer receives this reserved code immediately after confirming the
  -- request. Approval must create the replacement with the same reference.
  v_new_reference_code := v_appointment.pending_reschedule_reference_code;
  IF v_new_reference_code IS NULL
     OR v_new_reference_code !~ '^FRM-[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'The reschedule request is missing its replacement reference.';
  END IF;

  v_original_shop_notes := concat_ws(
    E'\n',
    NULLIF(btrim(v_appointment.admin_notes), ''),
    'Rescheduled to ' || v_new_reference_code,
    'Reason for rescheduling: ' || v_reason
  );
  v_new_shop_notes := concat_ws(
    E'\n',
    'Rescheduled from ' || v_appointment.reference_code,
    'Reason for rescheduling: ' || v_reason
  );

  INSERT INTO public.appointments AS replacement (
    reference_code,
    booking_request_id,
    customer_name,
    first_name,
    middle_name,
    last_name,
    phone,
    email,
    moto_brand,
    moto_model,
    moto_cc,
    moto_fuel_type,
    moto_transmission,
    moto_variant,
    moto_year,
    plate_number,
    appointment_date,
    start_time,
    status,
    notes,
    admin_notes,
    total_estimate,
    booking_duration_minutes,
    terms_accepted,
    assigned_crew_id,
    reschedule_count,
    rescheduled_from_appointment_id
  )
  VALUES (
    v_new_reference_code,
    gen_random_uuid(),
    v_appointment.customer_name,
    v_appointment.first_name,
    v_appointment.middle_name,
    v_appointment.last_name,
    v_appointment.phone,
    v_appointment.email,
    v_appointment.moto_brand,
    v_appointment.moto_model,
    v_appointment.moto_cc,
    v_appointment.moto_fuel_type,
    v_appointment.moto_transmission,
    v_appointment.moto_variant,
    v_appointment.moto_year,
    v_appointment.plate_number,
    v_appointment.pending_reschedule_date,
    v_appointment.pending_reschedule_start_time,
    'confirmed',
    v_appointment.notes,
    v_new_shop_notes,
    v_appointment.total_estimate,
    v_duration_minutes,
    v_appointment.terms_accepted,
    v_assigned_crew_id,
    v_appointment.reschedule_count + 1,
    v_appointment.id
  )
  RETURNING replacement.id INTO v_new_appointment_id;

  INSERT INTO public.appointment_services (
    appointment_id,
    service_id,
    service_name,
    price,
    duration_minutes
  )
  SELECT
    v_new_appointment_id,
    service.service_id,
    service.service_name,
    service.price,
    service.duration_minutes
  FROM public.appointment_services AS service
  WHERE service.appointment_id = v_appointment.id;

  UPDATE public.appointments
  SET status = 'rescheduled',
      admin_notes = v_original_shop_notes,
      reschedule_count = v_appointment.reschedule_count + 1,
      rescheduled_to_appointment_id = v_new_appointment_id,
      pending_reschedule_request_id = NULL,
      pending_reschedule_date = NULL,
      pending_reschedule_start_time = NULL,
      pending_reschedule_reference_code = NULL,
      pending_reschedule_reason = NULL
  WHERE id = v_appointment.id;

  INSERT INTO public.notifications (type, title, message, appointment_id)
  VALUES (
    'rescheduled_appointment',
    'Rescheduled booking ' || v_new_reference_code,
    v_appointment.customer_name || ' rescheduled from ' || v_appointment.reference_code
      || ' to ' || v_new_reference_code || '. Reason: ' || v_reason,
    v_new_appointment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_reschedule_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_reschedule_request(uuid, text) TO authenticated;
