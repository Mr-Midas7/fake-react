-- Replace granular engine-size rules with the booking categories used by the
-- customer flow: Small (50–150cc), Mid (151–499cc), and Big (500cc+).
-- Mid includes 401–499cc to ensure every valid catalog motorcycle has a rule.

DELETE FROM public.service_configurations;

WITH cc_categories (cc_category, price, duration_factor) AS (
  VALUES
    ('Small', 50.00::numeric, 1.00::numeric),
    ('Mid', 100.00::numeric, 1.25::numeric),
    ('Big', 150.00::numeric, 1.50::numeric)
),
fuel_types (fuel_type, extra_minutes) AS (
  VALUES
    ('FI', 0),
    ('Carbureted', 15)
),
transmissions (transmission, extra_minutes) AS (
  VALUES
    ('Automatic', 0),
    ('Semi-Auto', 0),
    ('Manual', 15)
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
  cc_categories.cc_category,
  fuel_types.fuel_type,
  transmissions.transmission,
  LEAST(
    480,
    GREATEST(
      15,
      CEIL(
        (
          COALESCE(service.duration_minutes, 60) * cc_categories.duration_factor
          + fuel_types.extra_minutes
          + transmissions.extra_minutes
        ) / 15.0
      ) * 15
    )
  )::integer,
  cc_categories.price
FROM public.services AS service
CROSS JOIN cc_categories
CROSS JOIN fuel_types
CROSS JOIN transmissions
WHERE service.is_active = true
  AND service.is_archived = false;
