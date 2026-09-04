-- Keep public catalogue reads limited to records that are actually visible on
-- the public website. Scheduling inputs are now available only to server-side
-- booking functions that use the service role.
DROP POLICY IF EXISTS "services public read" ON public.services;
CREATE POLICY "services public read" ON public.services
  FOR SELECT TO anon
  USING (is_active = true AND is_archived = false);

DROP POLICY IF EXISTS "products public read" ON public.products;
CREATE POLICY "products public read" ON public.products
  FOR SELECT TO anon
  USING (is_active = true AND is_archived = false);

DROP POLICY IF EXISTS "slots public read" ON public.time_slots;
DROP POLICY IF EXISTS "blocks public read" ON public.schedule_blocks;
REVOKE SELECT ON public.time_slots FROM anon;
REVOKE SELECT ON public.schedule_blocks FROM anon;

-- The application has no staff-level console. Remove that unused assignment
-- and replace the active role enum with the single role the application uses.
DELETE FROM public.user_roles WHERE role::text = 'staff';

ALTER TYPE public.app_role RENAME TO app_role_legacy;
CREATE TYPE public.app_role AS ENUM ('admin');

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role
  USING role::text::public.app_role;

-- Existing RLS policies keep their function binding after the rename. Preserve
-- that legacy binding for the applied migration history, then expose a clean
-- app_role-based function for all new code and policies.
ALTER FUNCTION public.has_role(uuid, public.app_role_legacy) RENAME TO has_role_legacy;

CREATE OR REPLACE FUNCTION public.has_role_legacy(
  _user_id uuid,
  _role public.app_role_legacy
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role::text
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(
  _user_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Records application-level admin actions that do not mutate a tracked table,
-- such as signing in/out or exporting a report. Data changes remain captured by
-- the table triggers created in the activity-log migration.
CREATE OR REPLACE FUNCTION public.record_admin_activity_event(
  p_action text,
  p_resource_type text,
  p_target_label text,
  p_summary text,
  p_changed_fields text[] DEFAULT ARRAY[]::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_claims text := current_setting('request.jwt.claims', true);
  v_log_id uuid;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_claims IS NOT NULL AND v_claims <> '' THEN
    v_actor_email := nullif(v_claims::jsonb ->> 'email', '');
  END IF;

  IF btrim(p_action) = '' OR btrim(p_resource_type) = '' OR btrim(p_target_label) = '' OR btrim(p_summary) = '' THEN
    RAISE EXCEPTION 'Activity event details are required';
  END IF;

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
    left(btrim(p_action), 80),
    left(btrim(p_resource_type), 120),
    left(btrim(p_target_label), 180),
    left(btrim(p_summary), 500),
    COALESCE(p_changed_fields, ARRAY[]::text[])
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_admin_activity_event(text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_admin_activity_event(text, text, text, text, text[]) TO authenticated;
