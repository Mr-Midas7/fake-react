-- Price changes can now identify the exact service or product configuration
-- that changed, while retaining compatibility with existing item-level history.
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS configuration_id uuid,
  ADD COLUMN IF NOT EXISTS configuration_label text;

UPDATE public.price_history
SET configuration_label = CASE
  WHEN table_name = 'services' THEN 'Base service'
  WHEN table_name = 'products' THEN 'Default item'
  ELSE 'Default configuration'
END
WHERE configuration_label IS NULL;

CREATE INDEX IF NOT EXISTS price_history_configuration_idx
  ON public.price_history (table_name, item_id, configuration_id, created_at DESC);

-- Preserve the actual archive event rather than relying on updated_at, which
-- can change later when a record is restored or edited.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.services
SET archived_at = COALESCE(archived_at, updated_at, created_at)
WHERE is_archived = true;

UPDATE public.products
SET archived_at = COALESCE(archived_at, updated_at, created_at)
WHERE is_archived = true;

CREATE OR REPLACE FUNCTION public.set_catalog_archive_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_archived = true AND OLD.is_archived = false THEN
    NEW.archived_at = now();
  ELSIF NEW.is_archived = false AND OLD.is_archived = true THEN
    NEW.archived_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS services_archive_timestamp ON public.services;
CREATE TRIGGER services_archive_timestamp
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_catalog_archive_timestamp();

DROP TRIGGER IF EXISTS products_archive_timestamp ON public.products;
CREATE TRIGGER products_archive_timestamp
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_catalog_archive_timestamp();

REVOKE EXECUTE ON FUNCTION public.set_catalog_archive_timestamp() FROM PUBLIC;
