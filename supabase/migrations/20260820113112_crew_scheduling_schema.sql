-- Crew scheduling: weekly rosters and availability exceptions

-- crew_schedules: weekly recurring work schedule per crew member
CREATE TABLE IF NOT EXISTS public.crew_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_working boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crew_id, day_of_week)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_schedules TO authenticated;
GRANT ALL ON public.crew_schedules TO service_role;
ALTER TABLE public.crew_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_schedules admin all" ON public.crew_schedules;
CREATE POLICY "crew_schedules admin all" ON public.crew_schedules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- crew_availability_exceptions: temporary unavailability (leave, sick, day off, emergency)
CREATE TABLE IF NOT EXISTS public.crew_availability_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time,
  end_time time,
  reason text NOT NULL CHECK (reason IN ('leave', 'sick', 'day_off', 'emergency', 'special_schedule')),
  note text,
  is_all_day boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_availability_exceptions TO authenticated;
GRANT ALL ON public.crew_availability_exceptions TO service_role;
ALTER TABLE public.crew_availability_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_exceptions admin all" ON public.crew_availability_exceptions;
CREATE POLICY "crew_exceptions admin all" ON public.crew_availability_exceptions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Add updated_at trigger to crew_schedules
DROP TRIGGER IF EXISTS crew_schedules_updated ON public.crew_schedules;
CREATE TRIGGER crew_schedules_updated BEFORE UPDATE ON public.crew_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
