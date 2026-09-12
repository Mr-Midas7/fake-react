-- Store the real inventory count while retaining the existing boolean for public availability UI.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

UPDATE public.products
SET stock_quantity = CASE WHEN in_stock THEN 1 ELSE 0 END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_stock_quantity_nonnegative'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_stock_quantity_nonnegative CHECK (stock_quantity >= 0);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_product_stock_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.stock_quantity := GREATEST(COALESCE(NEW.stock_quantity, 0), 0);
  NEW.in_stock := NEW.stock_quantity > 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_sync_stock_status ON public.products;
CREATE TRIGGER products_sync_stock_status
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_stock_status();
