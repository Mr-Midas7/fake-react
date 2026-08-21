-- roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.app_role AS ENUM ('admin','staff');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- services
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 60,
  category text NOT NULL DEFAULT 'general',
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "services public read" ON public.services;
CREATE POLICY "services public read" ON public.services FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "services admin write" ON public.services;
CREATE POLICY "services admin write" ON public.services FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS services_updated ON public.services;
CREATE TRIGGER services_updated BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'part',
  brand text,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  image_url text,
  in_stock boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products public read" ON public.products;
CREATE POLICY "products public read" ON public.products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "products admin write" ON public.products;
CREATE POLICY "products admin write" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS products_updated ON public.products;
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- time slots
CREATE TABLE IF NOT EXISTS public.time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.time_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_slots TO authenticated;
GRANT ALL ON public.time_slots TO service_role;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slots public read" ON public.time_slots;
CREATE POLICY "slots public read" ON public.time_slots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "slots admin write" ON public.time_slots;
CREATE POLICY "slots admin write" ON public.time_slots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- schedule blocks
CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_date date NOT NULL,
  start_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.schedule_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_blocks TO authenticated;
GRANT ALL ON public.schedule_blocks TO service_role;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocks public read" ON public.schedule_blocks;
CREATE POLICY "blocks public read" ON public.schedule_blocks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "blocks admin write" ON public.schedule_blocks;
CREATE POLICY "blocks admin write" ON public.schedule_blocks FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- crew
CREATE TABLE IF NOT EXISTS public.crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Mechanic',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_members TO authenticated;
GRANT ALL ON public.crew_members TO service_role;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew admin all" ON public.crew_members;
CREATE POLICY "crew admin all" ON public.crew_members FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text,
  moto_brand text NOT NULL,
  moto_model text NOT NULL,
  moto_variant text,
  moto_year integer,
  plate_number text NOT NULL,
  appointment_date date NOT NULL,
  start_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  admin_notes text,
  total_estimate numeric(10,2) NOT NULL DEFAULT 0,
  assigned_crew_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  terms_accepted boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_date_idx ON public.appointments (appointment_date, start_time);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments admin all" ON public.appointments;
CREATE POLICY "appointments admin all" ON public.appointments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_services TO authenticated;
GRANT ALL ON public.appointment_services TO service_role;
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appt services admin all" ON public.appointment_services;
CREATE POLICY "appt services admin all" ON public.appointment_services FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS appointments_updated ON public.appointments;
CREATE TRIGGER appointments_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'new_appointment',
  title text NOT NULL,
  message text,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications admin all" ON public.notifications;
CREATE POLICY "notifications admin all" ON public.notifications FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
  END IF;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'appointments') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.appointments;
  END IF;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
END $$;

-- seed slots (Mon-Sat 08:00-17:00, 1 hour)
INSERT INTO public.time_slots (start_time, end_time, capacity) VALUES
('08:00','09:00',2),('09:00','10:00',2),('10:00','11:00',2),('11:00','12:00',2),
('13:00','14:00',2),('14:00','15:00',2),('15:00','16:00',2),('16:00','17:00',2)
ON CONFLICT DO NOTHING;

INSERT INTO public.services (name, description, price, duration_minutes, category, sort_order) VALUES
('Preventive Maintenance Service (PMS)','Full check-up: oil change, brake, chain, and fluid inspection.',850.00,90,'maintenance',1),
('Change Oil','Engine oil and filter replacement using your preferred brand.',450.00,45,'maintenance',2),
('Suspension Tuning / Rebuild','Ohlins-grade fork and shock service, oil change and re-valving.',2500.00,180,'suspension',3),
('Tire Change & Balancing','Tire mounting, balancing and valve replacement.',600.00,60,'tires',4),
('Brake Service','Pad replacement, caliper clean and brake fluid bleed.',750.00,60,'brakes',5),
('Engine Overhaul','Top or bottom-end overhaul with parts assessment.',6500.00,480,'engine',6),
('Electrical Diagnostics','Wiring, charging system and lighting troubleshooting.',500.00,60,'electrical',7),
('Carburetor / FI Cleaning','Deep clean and tuning for smoother throttle response.',900.00,90,'engine',8)
ON CONFLICT DO NOTHING;

INSERT INTO public.products (name, category, brand, description, price, in_stock, is_featured, sort_order) VALUES
('Ohlins Rear Shock Absorber','part','Ohlins','Premium gas-charged rear shock with adjustable preload.',24500.00,true,true,1),
('Racing Clutch Assembly','part','Yoshimura','Heavy duty clutch kit for aggressive riding.',4800.00,true,true,2),
('Performance Exhaust Pipe','part','Akrapovic','Slip-on stainless exhaust with deep race tone.',13500.00,true,true,3),
('Braided Brake Hose','part','Galespeed','Stainless braided hose for sharper brake feel.',2100.00,true,false,4),
('CNC Adjustable Levers','accessory','Rizoma','Anodized aluminum brake and clutch levers.',1850.00,true,true,5),
('Full-Face Racing Helmet','accessory','HJC','DOT/ICC certified helmet with pinlock visor.',7900.00,true,true,6),
('Motocross Riding Gloves','accessory','Fox','Breathable gloves with silicone grip print.',1250.00,true,false,7),
('Motorcycle Tail Bag','accessory','Komine','Waterproof 20L expandable tail bag.',3400.00,true,false,8),
('Honda CRF150L','motorcycle','Honda','Dual sport 150cc, ideal for trail and city.',169900.00,true,true,9),
('Kawasaki KLX150','motorcycle','Kawasaki','Lightweight trail bike, brand new unit.',159000.00,true,true,10),
('Yamaha WR155R','motorcycle','Yamaha','VVA-equipped enduro with racing DNA.',189000.00,true,false,11),
('Suzuki Raider R150 Fi','motorcycle','Suzuki','Underbone legend with fuel injection.',129900.00,true,false,12)
ON CONFLICT DO NOTHING;

INSERT INTO public.crew_members (name, role, phone) VALUES
('Mang Tonio','Head Mechanic','09171234567'),
('JR Salazar','Suspension Specialist','09181234567'),
('Kevin Dela Cruz','Service Technician','09191234567')
ON CONFLICT DO NOTHING;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
