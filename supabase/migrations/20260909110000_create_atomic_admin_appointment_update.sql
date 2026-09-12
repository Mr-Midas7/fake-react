-- Keep an administrator's appointment edit atomic. This prevents a service edit
-- from being saved without the matching schedule, crew, total, and duration update.
CREATE OR REPLACE FUNCTION public.update_appointment_details_atomic(
  p_appointment_id uuid,
  p_service_ids uuid[],
  p_appointment_date date,
  p_start_time time,
  p_assigned_crew_id uuid,
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
BEGIN
  IF COALESCE(cardinality(p_service_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one service.';
  END IF;

  IF p_status NOT IN (
    'pending', 'confirmed', 'in_progress', 'completed', 'rescheduled', 'cancelled', 'no_show'
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

  IF p_assigned_crew_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.crew_members
    WHERE id = p_assigned_crew_id
      AND is_active = true
      AND is_archived = false
  ) THEN
    RAISE EXCEPTION 'The selected crew member is no longer available.';
  END IF;

  SELECT
    COALESCE(sum(price), 0),
    COALESCE(sum(duration_minutes), 0) + 30
  INTO v_total_estimate, v_duration_minutes
  FROM public.services
  WHERE id = ANY(p_service_ids);

  UPDATE public.appointments
  SET appointment_date = p_appointment_date,
      start_time = p_start_time,
      assigned_crew_id = p_assigned_crew_id,
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
  uuid, uuid[], date, time, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_appointment_details_atomic(
  uuid, uuid[], date, time, uuid, text, text
) TO authenticated;
