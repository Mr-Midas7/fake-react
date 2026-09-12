-- A customer cannot hold two active appointments for the same service on the
-- same day. Keep this as a deferred constraint trigger so multi-step atomic
-- appointment edits can replace services in one transaction without a false
-- positive. The customer-facing preflight check lives in booking.functions.ts;
-- this trigger is the concurrency-safe enforcement point.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_customer_service_appointments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_appointment_id uuid;
  v_phone text;
  v_appointment_date date;
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

  -- The changed appointment is not active, has been deleted as part of an
  -- update, or no longer exists. It cannot violate the active-booking rule.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
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
  ) THEN
    RAISE EXCEPTION
      'This customer already has an active appointment for one or more selected services on this date. Complete, cancel, or reject it before scheduling another.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_prevent_duplicate_active_customer_services ON public.appointments;
CREATE CONSTRAINT TRIGGER appointments_prevent_duplicate_active_customer_services
  AFTER INSERT OR UPDATE ON public.appointments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_active_customer_service_appointments();

DROP TRIGGER IF EXISTS appointment_services_prevent_duplicate_active_customer_services ON public.appointment_services;
CREATE CONSTRAINT TRIGGER appointment_services_prevent_duplicate_active_customer_services
  AFTER INSERT OR UPDATE ON public.appointment_services
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_active_customer_service_appointments();

CREATE INDEX IF NOT EXISTS appointments_active_customer_date_idx
  ON public.appointments (phone, appointment_date)
  WHERE is_archived = false
    AND rescheduled_to_appointment_id IS NULL
    AND status NOT IN ('completed', 'cancelled', 'rejected');

CREATE INDEX IF NOT EXISTS appointment_services_service_appointment_idx
  ON public.appointment_services (service_id, appointment_id);
