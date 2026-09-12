-- Return the conflicting service and reserved schedule in the concurrency-safe
-- database error as well, so a race condition receives the same useful feedback
-- as the booking preflight check.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_customer_service_appointments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_appointment_id uuid;
  v_phone text;
  v_appointment_date date;
  v_service_name text;
  v_start_time time;
BEGIN
  v_appointment_id := CASE
    WHEN TG_TABLE_NAME = 'appointments' THEN NEW.id
    ELSE NEW.appointment_id
  END;

  SELECT appointment.phone, appointment.appointment_date
  INTO v_phone, v_appointment_date
  FROM public.appointments AS appointment
  WHERE appointment.id = v_appointment_id
    AND appointment.is_archived = false
    AND appointment.rescheduled_to_appointment_id IS NULL
    AND appointment.status NOT IN ('completed', 'cancelled', 'rejected');

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT current_service.service_name, other_appointment.start_time
  INTO v_service_name, v_start_time
  FROM public.appointment_services AS current_service
  JOIN public.appointments AS other_appointment
    ON other_appointment.phone = v_phone
   AND other_appointment.appointment_date = v_appointment_date
   AND other_appointment.id <> v_appointment_id
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
  WHERE current_service.appointment_id = v_appointment_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'You already have an appointment for "%" on % at %.',
      v_service_name,
      to_char(v_appointment_date, 'FMDay, FMMonth FMDD, YYYY'),
      to_char(v_start_time, 'FMHH12:MI AM')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;
