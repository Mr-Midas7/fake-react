-- Store the record affected by an admin action and the request IP when the
-- Supabase gateway provides it. Historical rows remain valid with NULL values.
ALTER TABLE public.admin_activity_logs
  ADD COLUMN IF NOT EXISTS record_id uuid,
  ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS admin_activity_logs_record_id_idx
  ON public.admin_activity_logs (record_id);

CREATE OR REPLACE FUNCTION public.admin_activity_request_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers jsonb;
  v_forwarded_for text;
BEGIN
  v_headers := COALESCE(
    NULLIF(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  v_forwarded_for := COALESCE(
    v_headers ->> 'x-vercel-forwarded-for',
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    v_headers ->> 'x-forwarded-for'
  );

  RETURN NULLIF(btrim(split_part(COALESCE(v_forwarded_for, ''), ',', 1)), '');
EXCEPTION
  WHEN others THEN
    -- Logging must not block an admin action if a platform omits request headers.
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_activity_request_ip() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_activity_request_ip() TO authenticated, service_role;

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
  v_record_id uuid;
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
  IF COALESCE(v_record ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_record_id := (v_record ->> 'id')::uuid;
  END IF;
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
    changed_fields,
    record_id,
    ip_address
  )
  VALUES (
    v_actor_id,
    v_actor_email,
    v_action,
    initcap(replace(TG_TABLE_NAME, '_', ' ')),
    v_target,
    format('%s %s: %s', initcap(replace(TG_TABLE_NAME, '_', ' ')), v_action, v_target),
    v_changed_fields,
    v_record_id,
    public.admin_activity_request_ip()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

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
    changed_fields,
    ip_address
  )
  VALUES (
    v_actor_id,
    v_actor_email,
    left(btrim(p_action), 80),
    left(btrim(p_resource_type), 120),
    left(btrim(p_target_label), 180),
    left(btrim(p_summary), 500),
    COALESCE(p_changed_fields, ARRAY[]::text[]),
    public.admin_activity_request_ip()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;
