-- Preserve the appointment chain when a customer moves an appointment to a new slot.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS rescheduled_from_appointment_id uuid
    REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_to_appointment_id uuid
    REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_rescheduled_from_idx
  ON public.appointments (rescheduled_from_appointment_id);
CREATE INDEX IF NOT EXISTS appointments_rescheduled_to_idx
  ON public.appointments (rescheduled_to_appointment_id);

-- A rescheduled appointment is still a real appointment for capacity checks;
-- the replaced record is excluded through its rescheduled_to link.
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
    AND rescheduled_to_appointment_id IS NULL
    AND status IN ('pending', 'confirmed', 'in_progress', 'rescheduled')
  );

CREATE OR REPLACE FUNCTION public.create_rescheduled_booking_atomic(
  p_reference_code text,
  p_booking_request_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_moto_brand text,
  p_moto_model text,
  p_moto_variant text,
  p_moto_year integer,
  p_plate_number text,
  p_appointment_date date,
  p_start_time time,
  p_notes text,
  p_total_estimate numeric,
  p_booking_duration_minutes integer,
  p_assigned_crew_id uuid,
  p_services jsonb,
  p_notification_title text,
  p_notification_message text,
  p_original_appointment_id uuid
)
RETURNS TABLE (appointment_id uuid, reference_code text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_appointment_id uuid;
  v_reference_code text;
  v_original_status text;
BEGIN
  IF p_booking_request_id IS NULL THEN
    RAISE EXCEPTION 'A booking request ID is required.';
  END IF;

  IF jsonb_typeof(p_services) <> 'array' OR jsonb_array_length(p_services) = 0 THEN
    RAISE EXCEPTION 'A booking must include at least one service.';
  END IF;

  -- Lock the original before checking it so two simultaneous reschedule
  -- requests cannot both create replacements.
  SELECT appointments.status
    INTO v_original_status
  FROM public.appointments AS appointments
  WHERE appointments.id = p_original_appointment_id
    AND appointments.is_archived = false
    AND appointments.rescheduled_to_appointment_id IS NULL
  FOR UPDATE;

  IF v_original_status IS NULL OR v_original_status NOT IN ('pending', 'confirmed', 'rescheduled') THEN
    RAISE EXCEPTION 'This appointment is no longer available for rescheduling.';
  END IF;

  INSERT INTO public.appointments AS appointments (
    reference_code,
    booking_request_id,
    customer_name,
    phone,
    email,
    moto_brand,
    moto_model,
    moto_variant,
    moto_year,
    plate_number,
    appointment_date,
    start_time,
    status,
    notes,
    total_estimate,
    booking_duration_minutes,
    terms_accepted,
    assigned_crew_id,
    rescheduled_from_appointment_id
  )
  VALUES (
    p_reference_code,
    p_booking_request_id,
    p_customer_name,
    p_phone,
    p_email,
    p_moto_brand,
    p_moto_model,
    p_moto_variant,
    p_moto_year,
    p_plate_number,
    p_appointment_date,
    p_start_time,
    'rescheduled',
    p_notes,
    p_total_estimate,
    p_booking_duration_minutes,
    true,
    p_assigned_crew_id,
    p_original_appointment_id
  )
  RETURNING appointments.id, appointments.reference_code INTO v_appointment_id, v_reference_code;

  INSERT INTO public.appointment_services (
    appointment_id,
    service_id,
    service_name,
    price,
    duration_minutes
  )
  SELECT
    v_appointment_id,
    service.service_id,
    service.service_name,
    service.price,
    service.duration_minutes
  FROM jsonb_to_recordset(p_services) AS service(
    service_id uuid,
    service_name text,
    price numeric,
    duration_minutes integer
  );

  UPDATE public.appointments
  SET status = 'rescheduled',
      rescheduled_to_appointment_id = v_appointment_id
  WHERE id = p_original_appointment_id;

  INSERT INTO public.notifications (type, title, message, appointment_id)
  VALUES (
    'rescheduled_appointment',
    p_notification_title,
    p_notification_message,
    v_appointment_id
  );

  RETURN QUERY SELECT v_appointment_id, v_reference_code;
END;
$$;

REVOKE ALL ON FUNCTION public.create_rescheduled_booking_atomic(
  text, uuid, text, text, text, text, text, text, integer, text, date, time,
  text, numeric, integer, uuid, jsonb, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rescheduled_booking_atomic(
  text, uuid, text, text, text, text, text, text, integer, text, date, time,
  text, numeric, integer, uuid, jsonb, text, text, uuid
) TO service_role;
