-- Keep an auditable record of data-changing actions performed by administrators.
CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  resource_type text NOT NULL,
  target_label text NOT NULL,
  summary text NOT NULL,
  changed_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  activity_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
  activity_time time NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::time),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_activity_logs_created_at_idx
  ON public.admin_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_logs_filter_idx
  ON public.admin_activity_logs (activity_date DESC, activity_time DESC, action, resource_type);

GRANT SELECT ON public.admin_activity_logs TO authenticated;
GRANT ALL ON public.admin_activity_logs TO service_role;

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin activity logs read" ON public.admin_activity_logs;
CREATE POLICY "admin activity logs read" ON public.admin_activity_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.purge_expired_admin_activity_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.admin_activity_logs
  WHERE created_at < now() - interval '50 days';
$$;

REVOKE ALL ON FUNCTION public.purge_expired_admin_activity_logs() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.record_admin_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_claims text := current_setting('request.jwt.claims', true);
  v_actor_email text;
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_record jsonb;
  v_action text;
  v_target text;
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  -- Public/server-side activity (such as a customer booking) is not an admin action.
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_claims IS NOT NULL AND v_claims <> '' THEN
    v_actor_email := nullif(v_claims::jsonb ->> 'email', '');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(changed.key ORDER BY changed.key), ARRAY[]::text[])
    INTO v_changed_fields
    FROM jsonb_object_keys(v_new) AS changed(key)
    WHERE changed.key NOT IN ('created_at', 'updated_at')
      AND v_old -> changed.key IS DISTINCT FROM v_new -> changed.key;

    -- Do not record a no-op update or an update that only changed a timestamp.
    IF cardinality(v_changed_fields) = 0 THEN
      RETURN NEW;
    END IF;

    IF v_new ->> 'is_archived' IS DISTINCT FROM v_old ->> 'is_archived' THEN
      v_action := CASE WHEN (v_new ->> 'is_archived')::boolean THEN 'archived' ELSE 'restored' END;
    ELSIF v_new ->> 'is_active' IS DISTINCT FROM v_old ->> 'is_active' THEN
      v_action := CASE WHEN (v_new ->> 'is_active')::boolean THEN 'activated' ELSE 'deactivated' END;
    ELSIF v_new ->> 'status' IS DISTINCT FROM v_old ->> 'status' THEN
      v_action := 'status changed';
    ELSE
      v_action := 'updated';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSE
    v_action := 'deleted';
  END IF;

  v_record := CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END;
  v_target := COALESCE(
    nullif(v_record ->> 'reference_code', ''),
    nullif(v_record ->> 'name', ''),
    nullif(v_record ->> 'phone', ''),
    nullif(v_record ->> 'service_name', ''),
    nullif(v_record ->> 'block_date', ''),
    nullif(v_record ->> 'id', ''),
    'Record'
  );

  PERFORM public.purge_expired_admin_activity_logs();

  INSERT INTO public.admin_activity_logs (
    actor_id,
    actor_email,
    action,
    resource_type,
    target_label,
    summary,
    changed_fields
  )
  VALUES (
    v_actor_id,
    v_actor_email,
    v_action,
    initcap(replace(TG_TABLE_NAME, '_', ' ')),
    v_target,
    format('%s %s: %s', initcap(replace(TG_TABLE_NAME, '_', ' ')), v_action, v_target),
    v_changed_fields
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_admin_activity() FROM PUBLIC;

DROP TRIGGER IF EXISTS admin_activity_services ON public.services;
CREATE TRIGGER admin_activity_services
  AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_products ON public.products;
CREATE TRIGGER admin_activity_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_crew_members ON public.crew_members;
CREATE TRIGGER admin_activity_crew_members
  AFTER INSERT OR UPDATE OR DELETE ON public.crew_members
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_appointments ON public.appointments;
CREATE TRIGGER admin_activity_appointments
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_schedule_blocks ON public.schedule_blocks;
CREATE TRIGGER admin_activity_schedule_blocks
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_blocked_numbers ON public.blocked_numbers;
CREATE TRIGGER admin_activity_blocked_numbers
  AFTER INSERT OR UPDATE OR DELETE ON public.blocked_numbers
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_time_slots ON public.time_slots;
CREATE TRIGGER admin_activity_time_slots
  AFTER INSERT OR UPDATE OR DELETE ON public.time_slots
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_crew_schedules ON public.crew_schedules;
CREATE TRIGGER admin_activity_crew_schedules
  AFTER INSERT OR UPDATE OR DELETE ON public.crew_schedules
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_crew_availability_exceptions ON public.crew_availability_exceptions;
CREATE TRIGGER admin_activity_crew_availability_exceptions
  AFTER INSERT OR UPDATE OR DELETE ON public.crew_availability_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_price_history ON public.price_history;
CREATE TRIGGER admin_activity_price_history
  AFTER INSERT OR UPDATE OR DELETE ON public.price_history
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

DROP TRIGGER IF EXISTS admin_activity_notifications ON public.notifications;
CREATE TRIGGER admin_activity_notifications
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.record_admin_activity();

-- Delete expired records on every new activity. Schedule a daily cleanup as well when pg_cron is enabled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'purge-admin-activity-logs';

    PERFORM cron.schedule(
      'purge-admin-activity-logs',
      '15 0 * * *',
      'SELECT public.purge_expired_admin_activity_logs();'
    );
  END IF;
EXCEPTION
  WHEN undefined_function OR undefined_table OR insufficient_privilege THEN
    RAISE NOTICE 'Daily activity-log cleanup could not be scheduled; insert-trigger cleanup remains enabled.';
END;
$$;
