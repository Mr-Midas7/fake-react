-- Add is_active column to schedule_blocks for archive support
ALTER TABLE public.schedule_blocks
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Backfill existing rows (they are implicitly active)
UPDATE public.schedule_blocks
  SET is_active = true
  WHERE is_active IS DISTINCT FROM true;
