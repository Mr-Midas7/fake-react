-- Add missing updated_at column to crew_schedules (trigger references it but column was absent)
ALTER TABLE public.crew_schedules ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
