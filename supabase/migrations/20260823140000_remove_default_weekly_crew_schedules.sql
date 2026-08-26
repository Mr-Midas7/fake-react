-- The availability admin UI assigns crews to individual dates. Remove the
-- recurring defaults that could make a mechanic appear assigned when no
-- date-specific assignment was created.
DELETE FROM public.crew_schedules
WHERE schedule_date IS NULL
  AND start_time = '08:00:00'::time
  AND end_time = '17:00:00'::time
  AND is_working = true
  AND day_of_week IN (1, 2, 3, 4, 5, 6);
