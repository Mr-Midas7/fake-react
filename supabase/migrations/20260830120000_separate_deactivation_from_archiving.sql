-- A record can be deactivated (not visible to customers) without being archived.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.crew_members
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Before this migration, inactive records were the archive. Preserve that existing meaning.
UPDATE public.services
SET is_archived = true
WHERE is_active = false AND is_archived = false;

UPDATE public.products
SET is_archived = true
WHERE is_active = false AND is_archived = false;

UPDATE public.crew_members
SET is_archived = true
WHERE is_active = false AND is_archived = false;

CREATE INDEX IF NOT EXISTS services_is_archived_idx ON public.services (is_archived);
CREATE INDEX IF NOT EXISTS products_is_archived_idx ON public.products (is_archived);
CREATE INDEX IF NOT EXISTS crew_members_is_archived_idx ON public.crew_members (is_archived);
