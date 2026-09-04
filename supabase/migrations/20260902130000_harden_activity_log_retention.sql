-- Enforce the retention window when an authorized administrator views the log,
-- in addition to the insert-trigger and optional daily pg_cron cleanup.
CREATE OR REPLACE FUNCTION public.purge_expired_admin_activity_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- The function is also invoked by a trigger and a scheduled database job,
  -- where auth.uid() is null. Direct signed-in callers must be administrators.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.admin_activity_logs
  WHERE created_at < now() - interval '50 days';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_admin_activity_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_admin_activity_logs() TO authenticated;
