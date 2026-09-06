-- One persisted configuration record powers the admin settings dialog and the
-- customer-facing booking rules. Keeping it as a singleton avoids a shop-wide
-- setting being accidentally duplicated by separate administrators.
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  shop_name text NOT NULL DEFAULT 'Fake Rider Motorparts',
  address text NOT NULL DEFAULT 'Purok Bangkal Sta. Cruz, Baclayon, Bohol, Philippines',
  contact_number text NOT NULL DEFAULT '0916 126 3317',
  contact_email text NOT NULL DEFAULT 'joemartato4@gmail.com',
  booking_terms text NOT NULL DEFAULT 'Bookings are subject to shop confirmation. Please arrive 15 minutes before your slot. Late arrivals beyond 30 minutes may be rescheduled. Quoted prices are starting rates; parts and additional labor are billed separately. The shop is not liable for personal items left on the unit.

Cancellations must be made at least 48 hours before the schedule.

We use your name, contact details, motorcycle details, selected services, and notes only to manage this booking, contact you about it, and provide shop services. We do not sell your information.',
  logo_url text,
  minimum_booking_lead_hours integer NOT NULL DEFAULT 48 CHECK (minimum_booking_lead_hours BETWEEN 0 AND 168),
  max_advance_booking_days integer NOT NULL DEFAULT 30 CHECK (max_advance_booking_days BETWEEN 1 AND 365),
  default_appointment_duration_minutes integer NOT NULL DEFAULT 90 CHECK (default_appointment_duration_minutes BETWEEN 15 AND 600),
  allow_same_day_appointments boolean NOT NULL DEFAULT false,
  cancellation_notice_hours integer NOT NULL DEFAULT 48 CHECK (cancellation_notice_hours BETWEEN 0 AND 168),
  rescheduling_notice_hours integer NOT NULL DEFAULT 48 CHECK (rescheduling_notice_hours BETWEEN 0 AND 168),
  notify_confirmation boolean NOT NULL DEFAULT true,
  notify_cancellation boolean NOT NULL DEFAULT true,
  notify_reminder boolean NOT NULL DEFAULT true,
  reminder_hours_before integer NOT NULL DEFAULT 24 CHECK (reminder_hours_before BETWEEN 1 AND 168),
  notify_admin boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.shop_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.shop_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.shop_settings TO authenticated;
GRANT ALL ON public.shop_settings TO service_role;

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop settings public read" ON public.shop_settings;
CREATE POLICY "shop settings public read" ON public.shop_settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "shop settings admin insert" ON public.shop_settings;
CREATE POLICY "shop settings admin insert" ON public.shop_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "shop settings admin update" ON public.shop_settings;
CREATE POLICY "shop settings admin update" ON public.shop_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS shop_settings_updated ON public.shop_settings;
CREATE TRIGGER shop_settings_updated
  BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public URLs are needed for the customer-facing logo. Only administrators
-- can place, replace, or remove files from this bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-assets',
  'shop-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "shop assets public read" ON storage.objects;
CREATE POLICY "shop assets public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'shop-assets');

DROP POLICY IF EXISTS "shop assets admin insert" ON storage.objects;
CREATE POLICY "shop assets admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shop-assets' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "shop assets admin update" ON storage.objects;
CREATE POLICY "shop assets admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'shop-assets' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'shop-assets' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "shop assets admin delete" ON storage.objects;
CREATE POLICY "shop assets admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'shop-assets' AND public.has_role(auth.uid(), 'admin'));
