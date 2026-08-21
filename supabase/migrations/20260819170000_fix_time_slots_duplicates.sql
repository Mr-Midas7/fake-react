-- Add unique constraint on time_slots.start_time to prevent duplicates
-- First clean up any duplicates that exist from the seed data running multiple times
DELETE FROM public.time_slots
WHERE ctid IN (
  SELECT ctid
  FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (PARTITION BY start_time ORDER BY created_at) AS rn
    FROM public.time_slots
  ) t
  WHERE rn > 1
);

-- Add unique constraint on start_time
ALTER TABLE public.time_slots
ADD CONSTRAINT time_slots_start_time_key UNIQUE (start_time);
