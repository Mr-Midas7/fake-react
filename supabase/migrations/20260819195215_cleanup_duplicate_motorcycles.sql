-- Clean up duplicate motorcycle products, keeping the earliest created
DELETE FROM public.products a
USING public.products b
WHERE a.id != b.id
  AND a.name = b.name
  AND a.category = 'motorcycle'
  AND a.category = b.category
  AND a.created_at > b.created_at;
