-- Blocked phone numbers for the online booking form.
-- When a customer with a blocked number tries to book, the request is rejected.

CREATE TABLE IF NOT EXISTS public.blocked_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Normalize phone to lowercase for case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS blocked_numbers_phone_idx
  ON public.blocked_numbers (LOWER(phone));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_numbers TO authenticated;
GRANT ALL ON public.blocked_numbers TO service_role;
ALTER TABLE public.blocked_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocked_numbers admin all" ON public.blocked_numbers;
CREATE POLICY "blocked_numbers admin all" ON public.blocked_numbers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
