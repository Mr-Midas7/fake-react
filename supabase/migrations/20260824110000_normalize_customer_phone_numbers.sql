-- Store customer and blocked-number mobile values in one canonical E.164
-- format. The application accepts both local 09XXXXXXXXX and +639XXXXXXXXX
-- input, then saves +639XXXXXXXXX.
WITH normalized AS (
  SELECT
    id,
    CASE
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^09[0-9]{9}$'
        THEN '+63' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 2)
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^639[0-9]{9}$'
        THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
    END AS canonical_phone
  FROM public.appointments
)
UPDATE public.appointments AS appointment
SET phone = normalized.canonical_phone
FROM normalized
WHERE appointment.id = normalized.id
  AND normalized.canonical_phone IS NOT NULL
  AND appointment.phone IS DISTINCT FROM normalized.canonical_phone;

WITH normalized AS (
  SELECT
    id,
    CASE
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^09[0-9]{9}$'
        THEN '+63' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 2)
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^639[0-9]{9}$'
        THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
    END AS canonical_phone
  FROM public.blocked_numbers
)
UPDATE public.blocked_numbers AS blocked_number
SET phone = normalized.canonical_phone
FROM normalized
WHERE blocked_number.id = normalized.id
  AND normalized.canonical_phone IS NOT NULL
  AND blocked_number.phone IS DISTINCT FROM normalized.canonical_phone;

-- Keep legacy malformed rows readable during the migration, while ensuring
-- every newly written or updated phone number uses the canonical format.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_phone_e164_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_phone_e164_check
  CHECK (phone ~ '^[+]639[0-9]{9}$') NOT VALID;

ALTER TABLE public.blocked_numbers
  DROP CONSTRAINT IF EXISTS blocked_numbers_phone_e164_check;
ALTER TABLE public.blocked_numbers
  ADD CONSTRAINT blocked_numbers_phone_e164_check
  CHECK (phone ~ '^[+]639[0-9]{9}$') NOT VALID;
