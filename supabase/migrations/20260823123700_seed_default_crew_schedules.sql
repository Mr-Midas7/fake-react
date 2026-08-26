-- Re-seed default weekly crew schedules (Mon–Sat 08:00–17:00) for every active
-- mechanic after remove_seeded_weekly_schedules.sql ran (which deleted nothing on
-- a fresh DB). Without these schedules the booking calendar shows zero selectable
-- dates because every date is filtered out by the hasMechanic check in book.tsx.
INSERT INTO public.crew_schedules (crew_id, day_of_week, start_time, end_time, is_working)
SELECT cm.id, v.dow, '08:00:00'::time, '17:00:00'::time, true
FROM public.crew_members cm
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) AS v(dow)
WHERE cm.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.crew_schedules cs
    WHERE cs.crew_id = cm.id
      AND cs.day_of_week = v.dow
      AND cs.schedule_date IS NULL
  );
