-- The original duplicate-service trigger was attached to both appointments
-- and appointment_services. PostgreSQL caches a trigger function's NEW row
-- shape, so one shared function cannot safely access table-specific columns.
-- Keep the validation in one helper and use a small trigger wrapper per table.

CREATE OR REPLACE FUNCTION public.assert_no_duplicate_active_customer_service_appointment(
  p_appointment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_appointment_date date;
  v_service_name text;
  v_start_time time;
BEGIN
  SELECT appointment.phone, appointment.appointment_date
  INTO v_phone, v_appointment_date
  FROM public.appointments AS appointment
  WHERE appointment.id = p_appointment_id
    AND appointment.is_archived = false
    AND appointment.rescheduled_to_appointment_id IS NULL
    AND appointment.status NOT IN ('completed', 'cancelled', 'rejected');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT current_service.service_name, other_appointment.start_time
  INTO v_service_name, v_start_time
  FROM public.appointment_services AS current_service
  JOIN public.appointments AS other_appointment
    ON other_appointment.phone = v_phone
   AND other_appointment.appointment_date = v_appointment_date
   AND other_appointment.id <> p_appointment_id
   AND other_appointment.is_archived = false
   AND other_appointment.rescheduled_to_appointment_id IS NULL
   AND other_appointment.status NOT IN ('completed', 'cancelled', 'rejected')
  JOIN public.appointment_services AS other_service
    ON other_service.appointment_id = other_appointment.id
   AND (
     other_service.service_id = current_service.service_id
     OR (
       other_service.service_id IS NULL
       AND current_service.service_id IS NULL
       AND other_service.service_name = current_service.service_name
     )
   )
  WHERE current_service.appointment_id = p_appointment_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'You already have an appointment for "%" on % at %.',
      v_service_name,
      to_char(v_appointment_date, 'FMDay, FMMonth FMDD, YYYY'),
      to_char(v_start_time, 'FMHH12:MI AM')
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_customer_service_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_no_duplicate_active_customer_service_appointment(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_customer_service_from_service()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_no_duplicate_active_customer_service_appointment(NEW.appointment_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_prevent_duplicate_active_customer_services ON public.appointments;
CREATE CONSTRAINT TRIGGER appointments_prevent_duplicate_active_customer_services
  AFTER INSERT OR UPDATE ON public.appointments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_active_customer_service_from_appointment();

DROP TRIGGER IF EXISTS appointment_services_prevent_duplicate_active_customer_services ON public.appointment_services;
CREATE CONSTRAINT TRIGGER appointment_services_prevent_duplicate_active_customer_services
  AFTER INSERT OR UPDATE ON public.appointment_services
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_active_customer_service_from_service();
