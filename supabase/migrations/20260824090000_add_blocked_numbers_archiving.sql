-- Keep removed blocked numbers available for restoration in the admin archive.
ALTER TABLE public.blocked_numbers
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Existing blocked numbers remain active unless explicitly archived.
UPDATE public.blocked_numbers
  SET is_archived = false
  WHERE is_archived IS DISTINCT FROM false;

CREATE INDEX IF NOT EXISTS blocked_numbers_is_archived_idx
  ON public.blocked_numbers (is_archived);
