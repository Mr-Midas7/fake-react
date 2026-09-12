-- A reschedule changes an existing appointment in place. Keep a durable count so
-- both the customer portal and the admin console share the same three-move limit.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reschedule_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reschedule_rejection_message text;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_reschedule_count_range;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_reschedule_count_range
  CHECK (reschedule_count BETWEEN 0 AND 3);

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
    -- Rejecting a request clears only the pending request fields; the original
    -- appointment date and time stay reserved and are therefore unchanged here.
    NEW.last_reschedule_rejected_at := now();
    NEW.last_reschedule_rejection_message :=
      'Reschedule Request Rejected. Your requested reschedule was not approved. Your original appointment remains unchanged and reserved.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_track_reschedule ON public.appointments;
CREATE TRIGGER appointments_track_reschedule
  BEFORE UPDATE OF appointment_date, start_time, pending_reschedule_request_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.track_appointment_reschedule();

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
  IF v_appointment.reschedule_count >= 3 THEN
    RAISE EXCEPTION 'This appointment has reached the maximum of 3 reschedules.';
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

REVOKE ALL ON FUNCTION public.submit_reschedule_request(uuid, uuid, date, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_reschedule_request(uuid, uuid, date, time, text) TO service_role;
