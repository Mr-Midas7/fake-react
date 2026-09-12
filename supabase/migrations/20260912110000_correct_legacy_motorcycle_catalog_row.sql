-- Correct a legacy catalog entry that was saved with the wrong manufacturer and no specifications.
-- The S 1000 R is a BMW roadster, not a Honda model.
UPDATE public.products
SET
  name = 'BMW S 1000 R',
  brand = 'BMW',
  engine_cc = 999.0,
  fuel_type = 'FI',
  transmission = 'Manual',
  is_active = true
WHERE category = 'motorcycle'
  AND lower(name) = 'honda s1000r';
