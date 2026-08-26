-- Persistent limits for unauthenticated booking endpoints. The application
-- calls this only with its service-role client, so the counters are not
-- exposed through the public Supabase API.
CREATE TABLE IF NOT EXISTS public.public_endpoint_rate_limits (
  scope text NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 64),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 128),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject)
);

GRANT ALL ON public.public_endpoint_rate_limits TO service_role;
ALTER TABLE public.public_endpoint_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_public_rate_limit(
  p_scope text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Rate-limit configuration must be positive.';
  END IF;

  -- Keep the small counter table bounded without relying on a scheduled job.
  DELETE FROM public.public_endpoint_rate_limits
  WHERE scope = p_scope
    AND window_started_at < now() - make_interval(secs => GREATEST(p_window_seconds * 2, 86400));

  INSERT INTO public.public_endpoint_rate_limits (
    scope,
    subject,
    window_started_at,
    request_count,
    updated_at
  )
  VALUES (p_scope, p_subject, now(), 1, now())
  ON CONFLICT (scope, subject) DO UPDATE
  SET
    window_started_at = CASE
      WHEN public_endpoint_rate_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
        THEN now()
      ELSE public_endpoint_rate_limits.window_started_at
    END,
    request_count = CASE
      WHEN public_endpoint_rate_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE public_endpoint_rate_limits.request_count + 1
    END,
    updated_at = now()
  RETURNING request_count <= p_limit INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_public_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_public_rate_limit(text, text, integer, integer)
  TO service_role;
