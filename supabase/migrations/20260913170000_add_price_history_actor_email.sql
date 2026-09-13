-- Keep a readable administrator identifier with each price change. The UUID
-- remains available for audit joins; the email is captured at write time so
-- history remains useful without exposing auth.users to the client.
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS changed_by_email text;

CREATE OR REPLACE FUNCTION public.set_price_history_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.changed_by = COALESCE(auth.uid(), NEW.changed_by);
  NEW.changed_by_email = COALESCE(auth.jwt() ->> 'email', NEW.changed_by_email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS price_history_actor ON public.price_history;
CREATE TRIGGER price_history_actor
  BEFORE INSERT ON public.price_history
  FOR EACH ROW EXECUTE FUNCTION public.set_price_history_actor();

REVOKE EXECUTE ON FUNCTION public.set_price_history_actor() FROM PUBLIC;
