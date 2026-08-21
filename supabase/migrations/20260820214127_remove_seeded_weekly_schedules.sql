-- Remove seeded weekly crew schedules (Mon-Sat 8:00-17:00) so mechanics
-- only appear on days that are explicitly scheduled via the admin UI.
DELETE FROM public.crew_schedules
WHERE schedule_date IS NULL
  AND start_time = '08:00:00'::time
  AND end_time = '17:00:00'::time
  AND is_working = true
  AND day_of_week IN (1, 2, 3, 4, 5, 6);
