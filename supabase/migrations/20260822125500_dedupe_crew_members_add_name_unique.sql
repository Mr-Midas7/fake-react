-- Deduplicate crew_members and add unique index on name to prevent future duplicates.

-- 1. Delete duplicate crew_members, keeping the one with the smallest id per name
DELETE FROM public.crew_members a
USING public.crew_members b
WHERE a.name = b.name
  AND a.id > b.id;

-- 2. Add unique index on name to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS crew_members_name_idx
  ON public.crew_members (name);

-- 3. Add updated_at column and trigger for consistency
ALTER TABLE public.crew_members
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_crew_members_updated_at ON public.crew_members;
CREATE TRIGGER update_crew_members_updated_at
  BEFORE UPDATE ON public.crew_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
