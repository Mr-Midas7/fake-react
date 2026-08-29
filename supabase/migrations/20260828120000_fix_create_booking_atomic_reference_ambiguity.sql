-- The function's OUT column name `reference_code` is also a column on
-- appointments. Qualify every reference so PostgreSQL does not treat it as an
-- ambiguous PL/pgSQL variable during a final booking write.
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
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
  p_notification_message text
)
RETURNS TABLE (appointment_id uuid, reference_code text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_appointment_id uuid;
  v_reference_code text;
BEGIN
  IF p_booking_request_id IS NULL THEN
    RAISE EXCEPTION 'A booking request ID is required.';
  END IF;

  IF jsonb_typeof(p_services) <> 'array' OR jsonb_array_length(p_services) = 0 THEN
    RAISE EXCEPTION 'A booking must include at least one service.';
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
    notes,
    total_estimate,
    booking_duration_minutes,
    terms_accepted,
    assigned_crew_id
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
    p_notes,
    p_total_estimate,
    p_booking_duration_minutes,
    true,
    p_assigned_crew_id
  )
  ON CONFLICT DO NOTHING
  RETURNING appointments.id, appointments.reference_code INTO v_appointment_id, v_reference_code;

  IF v_appointment_id IS NULL THEN
    SELECT appointments.id, appointments.reference_code
    INTO v_appointment_id, v_reference_code
    FROM public.appointments AS appointments
    WHERE appointments.booking_request_id = p_booking_request_id;

    IF FOUND THEN
      RETURN QUERY SELECT v_appointment_id, v_reference_code;
      RETURN;
    END IF;

    RAISE EXCEPTION 'The requested schedule is no longer available.' USING ERRCODE = '23P01';
  END IF;

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

  INSERT INTO public.notifications (type, title, message, appointment_id)
  VALUES (
    'new_appointment',
    p_notification_title,
    p_notification_message,
    v_appointment_id
  );

  RETURN QUERY SELECT v_appointment_id, v_reference_code;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_atomic(
  text, uuid, text, text, text, text, text, text, integer, text, date, time,
  text, numeric, integer, uuid, jsonb, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(
  text, uuid, text, text, text, text, text, text, integer, text, date, time,
  text, numeric, integer, uuid, jsonb, text, text
) TO service_role;
