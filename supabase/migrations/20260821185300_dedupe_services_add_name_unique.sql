-- Deduplicate services by name (cleanup) and add a unique index to prevent future duplicates
-- Two seed migrations (20260816152359 and 20260818222449) both insert the same services
-- without a unique constraint on name, creating duplicate rows with different UUIDs.

DELETE FROM public.services a
USING public.services b
WHERE a.id != b.id
  AND a.name = b.name
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS services_name_idx ON public.services (name);
