-- Clean up duplicate products and services, and ensure unique indexes exist

-- Products: remove duplicates by name, keeping the earliest created_at
DELETE FROM public.products a
USING public.products b
WHERE a.id != b.id
  AND a.name = b.name
  AND a.created_at > b.created_at;

-- Services: remove duplicates by name, keeping the earliest created_at
DELETE FROM public.services a
USING public.services b
WHERE a.id != b.id
  AND a.name = b.name
  AND a.created_at > b.created_at;

-- Ensure unique indexes exist on name columns
CREATE UNIQUE INDEX IF NOT EXISTS products_name_idx ON public.products (name);
CREATE UNIQUE INDEX IF NOT EXISTS services_name_idx ON public.services (name);
