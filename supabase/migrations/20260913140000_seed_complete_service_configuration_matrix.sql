-- Every service receives a predictable rate and estimated duration for each
-- supported engine-size, fuel, and transmission combination. The matrix keeps
-- the service's base price/duration as the 110cc FI automatic baseline, then
-- scales larger engines and the extra labour of carbureted/manual systems.

CREATE UNIQUE INDEX IF NOT EXISTS service_configurations_service_rule_key
  ON public.service_configurations (service_id, cc_category, fuel_type, transmission);

WITH cc_bands (cc_category, price_factor, duration_factor) AS (
  VALUES
    ('110', 1.00::numeric, 1.00::numeric),
    ('115', 1.00::numeric, 1.00::numeric),
    ('125', 1.05::numeric, 1.00::numeric),
    ('150', 1.15::numeric, 1.10::numeric),
    ('160', 1.20::numeric, 1.10::numeric),
    ('250', 1.35::numeric, 1.20::numeric),
    ('400', 1.55::numeric, 1.30::numeric),
    ('500', 1.70::numeric, 1.40::numeric),
    ('600', 1.85::numeric, 1.50::numeric),
    ('650', 1.90::numeric, 1.55::numeric),
    ('700', 2.00::numeric, 1.65::numeric),
    ('900', 2.20::numeric, 1.80::numeric),
    ('1000', 2.40::numeric, 2.00::numeric)
),
fuel_types (fuel_type, price_factor, duration_factor) AS (
  VALUES
    ('FI', 1.00::numeric, 1.00::numeric),
    ('Carbureted', 1.10::numeric, 1.10::numeric)
),
transmissions (transmission, price_factor, duration_factor) AS (
  VALUES
    ('Automatic', 1.00::numeric, 1.00::numeric),
    ('Semi-Auto', 1.02::numeric, 1.00::numeric),
    ('Manual', 1.05::numeric, 1.05::numeric)
)
INSERT INTO public.service_configurations (
  service_id,
  cc_category,
  fuel_type,
  transmission,
  duration_minutes,
  price
)
SELECT
  service.id,
  cc_bands.cc_category,
  fuel_types.fuel_type,
  transmissions.transmission,
  LEAST(
    480,
    GREATEST(
      15,
      CEIL(
        (
          COALESCE(service.duration_minutes, 60)
          * cc_bands.duration_factor
          * fuel_types.duration_factor
          * transmissions.duration_factor
        ) / 15.0
      ) * 15
    )
  )::integer,
  GREATEST(
    50::numeric,
    ROUND(
      (
        service.price
        * cc_bands.price_factor
        * fuel_types.price_factor
        * transmissions.price_factor
      ) / 50.0
    ) * 50
  )::numeric(10, 2)
FROM public.services AS service
CROSS JOIN cc_bands
CROSS JOIN fuel_types
CROSS JOIN transmissions
WHERE service.is_active = true
  AND service.is_archived = false
ON CONFLICT (service_id, cc_category, fuel_type, transmission) DO UPDATE
SET
  duration_minutes = EXCLUDED.duration_minutes,
  price = EXCLUDED.price,
  updated_at = now();
