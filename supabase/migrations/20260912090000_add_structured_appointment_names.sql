-- Store the individual customer name fields while retaining customer_name as
-- the backwards-compatible full-name value used by existing reports and views.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Give existing appointments editable starting values. The original full name
-- remains untouched, so no historical information is lost when a legacy name
-- cannot be split perfectly.
UPDATE public.appointments
SET first_name = COALESCE(first_name, split_part(btrim(customer_name), ' ', 1)),
    middle_name = COALESCE(
      middle_name,
      NULLIF(
        regexp_replace(
          regexp_replace(btrim(customer_name), '^[^[:space:]]+[[:space:]]*', ''),
          '[[:space:]]*[^[:space:]]+$',
          ''
        ),
        ''
      )
    ),
    last_name = COALESCE(
      last_name,
      CASE
        WHEN btrim(customer_name) LIKE '% %' THEN regexp_replace(btrim(customer_name), '^.*[[:space:]]+', '')
        ELSE NULL
      END
    )
WHERE first_name IS NULL OR middle_name IS NULL OR last_name IS NULL;

CREATE FUNCTION public.create_booking_atomic(
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
  p_first_name text,
  p_middle_name text,
  p_last_name text
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
  IF COALESCE(btrim(p_first_name), '') !~ '^[[:alpha:]]+( [[:alpha:]]+)*$'
     OR COALESCE(btrim(p_middle_name), '') !~ '^[[:alpha:]]+( [[:alpha:]]+)*$'
     OR COALESCE(btrim(p_last_name), '') !~ '^[[:alpha:]]+( [[:alpha:]]+)*$' THEN
    RAISE EXCEPTION 'First name, middle name, and last name must contain letters only.';
  END IF;

  SELECT created.appointment_id, created.reference_code
    INTO v_appointment_id, v_reference_code
  FROM public.create_booking_atomic(
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
    p_assigned_crew_id,
    p_services,
    p_notification_title,
    p_notification_message
  ) AS created;

  UPDATE public.appointments
  SET first_name = btrim(p_first_name),
      middle_name = btrim(p_middle_name),
      last_name = btrim(p_last_name),
      customer_name = concat_ws(' ', btrim(p_first_name), btrim(p_middle_name), btrim(p_last_name))
  WHERE id = v_appointment_id;

  RETURN QUERY SELECT v_appointment_id, v_reference_code;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_atomic(
  text, uuid, text, text, text, text, text, text, integer, text, date, time,
  text, numeric, integer, uuid, jsonb, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(
  text, uuid, text, text, text, text, text, text, integer, text, date, time,
  text, numeric, integer, uuid, jsonb, text, text, text, text, text
) TO service_role;

CREATE FUNCTION public.update_appointment_details_atomic(
  p_appointment_id uuid,
  p_service_ids uuid[],
  p_appointment_date date,
  p_start_time time,
  p_assigned_crew_id uuid,
  p_crew_assignment_manual boolean,
  p_status text,
  p_admin_notes text,
  p_first_name text,
  p_middle_name text,
  p_last_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(btrim(p_first_name), '') !~ '^[[:alpha:]]+( [[:alpha:]]+)*$'
     OR COALESCE(btrim(p_middle_name), '') !~ '^[[:alpha:]]+( [[:alpha:]]+)*$'
     OR COALESCE(btrim(p_last_name), '') !~ '^[[:alpha:]]+( [[:alpha:]]+)*$' THEN
    RAISE EXCEPTION 'First name, middle name, and last name must contain letters only.';
  END IF;

  PERFORM public.update_appointment_details_atomic(
    p_appointment_id,
    p_service_ids,
    p_appointment_date,
    p_start_time,
    p_assigned_crew_id,
    p_crew_assignment_manual,
    p_status,
    p_admin_notes
  );

  UPDATE public.appointments
  SET first_name = btrim(p_first_name),
      middle_name = btrim(p_middle_name),
      last_name = btrim(p_last_name),
      customer_name = concat_ws(' ', btrim(p_first_name), btrim(p_middle_name), btrim(p_last_name))
  WHERE id = p_appointment_id
    AND is_archived = false;
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment_details_atomic(
  uuid, uuid[], date, time, uuid, boolean, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_appointment_details_atomic(
  uuid, uuid[], date, time, uuid, boolean, text, text, text, text, text
) TO authenticated;
