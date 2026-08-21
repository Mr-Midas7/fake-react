-- Fix: authenticated role was revoked from update_updated_at_column function,
-- causing triggers that call it (e.g. appointments_updated) to fail on UPDATE.
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
