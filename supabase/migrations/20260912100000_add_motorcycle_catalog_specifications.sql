-- Motorcycle catalog fields. Engine displacement is nullable only for electric motorcycles.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS engine_cc numeric(6, 1),
  ADD COLUMN IF NOT EXISTS fuel_type text,
  ADD COLUMN IF NOT EXISTS transmission text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_engine_cc_positive') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_engine_cc_positive CHECK (engine_cc IS NULL OR engine_cc > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_fuel_type_valid') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_fuel_type_valid
      CHECK (fuel_type IS NULL OR fuel_type IN ('FI', 'Carbureted', 'Electric'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_transmission_valid') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_transmission_valid
      CHECK (transmission IS NULL OR transmission IN ('Manual', 'Semi-Automatic', 'Automatic'));
  END IF;
END
$$;

-- Verified Philippine-market model baseline. Entries are model-level; trim-only variants
-- with identical powertrain data share a catalog row. Sources: Honda PH, Suzuki PH, RE PH.
INSERT INTO public.products (
  name, category, brand, engine_cc, fuel_type, transmission, is_active, in_stock, sort_order
)
VALUES
  ('Honda ADV160', 'motorcycle', 'Honda', 156.9, 'FI', 'Automatic', true, true, 100),
  ('Honda AirBlade160', 'motorcycle', 'Honda', 156.9, 'FI', 'Automatic', true, true, 101),
  ('Honda Beat', 'motorcycle', 'Honda', 109.5, 'FI', 'Automatic', true, true, 102),
  ('Honda CB1000R', 'motorcycle', 'Honda', 998.0, 'FI', 'Manual', true, true, 103),
  ('Honda CB150R', 'motorcycle', 'Honda', 149.2, 'FI', 'Manual', true, true, 104),
  ('Honda CB150X', 'motorcycle', 'Honda', 149.2, 'FI', 'Manual', true, true, 105),
  ('Honda CB500F', 'motorcycle', 'Honda', 471.0, 'FI', 'Manual', true, true, 106),
  ('Honda CB500X', 'motorcycle', 'Honda', 471.0, 'FI', 'Manual', true, true, 107),
  ('Honda CB650R', 'motorcycle', 'Honda', 649.0, 'FI', 'Manual', true, true, 108),
  ('Honda CBR150R', 'motorcycle', 'Honda', 149.2, 'FI', 'Manual', true, true, 109),
  ('Honda CBR500R', 'motorcycle', 'Honda', 471.0, 'FI', 'Manual', true, true, 110),
  ('Honda CBR650R', 'motorcycle', 'Honda', 649.0, 'FI', 'Manual', true, true, 111),
  ('Honda CL500', 'motorcycle', 'Honda', 471.0, 'FI', 'Manual', true, true, 112),
  ('Honda Click125', 'motorcycle', 'Honda', 124.9, 'FI', 'Automatic', true, true, 113),
  ('Honda Click160', 'motorcycle', 'Honda', 156.9, 'FI', 'Automatic', true, true, 114),
  ('Honda CRF150L', 'motorcycle', 'Honda', 149.2, 'FI', 'Manual', true, true, 115),
  ('Honda CRF300L', 'motorcycle', 'Honda', 286.0, 'FI', 'Manual', true, true, 116),
  ('Honda CRF300 Rally', 'motorcycle', 'Honda', 286.0, 'FI', 'Manual', true, true, 117),
  ('Honda Dio', 'motorcycle', 'Honda', 109.5, 'FI', 'Automatic', true, true, 118),
  ('Honda EM1 e:', 'motorcycle', 'Honda', null, 'Electric', 'Automatic', true, true, 119),
  ('Honda Gold Wing', 'motorcycle', 'Honda', 1833.0, 'FI', 'Automatic', true, true, 120),
  ('Honda NAVi', 'motorcycle', 'Honda', 109.2, 'Carbureted', 'Automatic', true, true, 121),
  ('Honda PCX160', 'motorcycle', 'Honda', 156.9, 'FI', 'Automatic', true, true, 122),
  ('Honda Rebel500', 'motorcycle', 'Honda', 471.0, 'FI', 'Manual', true, true, 123),
  ('Honda RS125 Fi', 'motorcycle', 'Honda', 124.9, 'FI', 'Semi-Automatic', true, true, 124),
  ('Honda Supra GTR150', 'motorcycle', 'Honda', 149.2, 'FI', 'Semi-Automatic', true, true, 125),
  ('Honda TMX125 Alpha', 'motorcycle', 'Honda', 124.1, 'Carbureted', 'Manual', true, true, 126),
  ('Honda TMX Supremo', 'motorcycle', 'Honda', 149.0, 'Carbureted', 'Manual', true, true, 127),
  ('Honda Wave RSX', 'motorcycle', 'Honda', 109.1, 'FI', 'Semi-Automatic', true, true, 128),
  ('Honda X-ADV', 'motorcycle', 'Honda', 745.0, 'FI', 'Automatic', true, true, 129),
  ('Honda XL750 Transalp', 'motorcycle', 'Honda', 755.0, 'FI', 'Manual', true, true, 130),
  ('Honda XRM125 DS', 'motorcycle', 'Honda', 124.9, 'FI', 'Semi-Automatic', true, true, 131),
  ('Honda XR150L', 'motorcycle', 'Honda', 149.2, 'Carbureted', 'Manual', true, true, 132),

  ('Kawasaki KLX150', 'motorcycle', 'Kawasaki', 144.0, 'Carbureted', 'Manual', true, true, 200),
  ('Kawasaki Z150', 'motorcycle', 'Kawasaki', 144.0, 'Carbureted', 'Manual', true, true, 201),

  ('KTM 125 Duke', 'motorcycle', 'KTM', 124.7, 'FI', 'Manual', true, true, 300),
  ('KTM 200 Duke', 'motorcycle', 'KTM', 199.5, 'FI', 'Manual', true, true, 301),
  ('KTM 390 Adventure', 'motorcycle', 'KTM', 373.0, 'FI', 'Manual', true, true, 302),
  ('KTM 390 Duke', 'motorcycle', 'KTM', 373.0, 'FI', 'Manual', true, true, 303),
  ('KTM 790 Adventure', 'motorcycle', 'KTM', 799.0, 'FI', 'Manual', true, true, 304),
  ('KTM 790 Duke', 'motorcycle', 'KTM', 799.0, 'FI', 'Manual', true, true, 305),
  ('KTM RC 200', 'motorcycle', 'KTM', 199.5, 'FI', 'Manual', true, true, 306),
  ('KTM RC 390', 'motorcycle', 'KTM', 373.0, 'FI', 'Manual', true, true, 307),

  ('Royal Enfield Bear 650', 'motorcycle', 'Royal Enfield', 648.0, 'FI', 'Manual', true, true, 400),
  ('Royal Enfield Bullet 350', 'motorcycle', 'Royal Enfield', 349.0, 'FI', 'Manual', true, true, 401),
  ('Royal Enfield Classic 350', 'motorcycle', 'Royal Enfield', 349.0, 'FI', 'Manual', true, true, 402),
  ('Royal Enfield Classic 650', 'motorcycle', 'Royal Enfield', 648.0, 'FI', 'Manual', true, true, 403),
  ('Royal Enfield Continental GT 650', 'motorcycle', 'Royal Enfield', 648.0, 'FI', 'Manual', true, true, 404),
  ('Royal Enfield Goan Classic 350', 'motorcycle', 'Royal Enfield', 349.0, 'FI', 'Manual', true, true, 405),
  ('Royal Enfield Guerrilla 450', 'motorcycle', 'Royal Enfield', 452.0, 'FI', 'Manual', true, true, 406),
  ('Royal Enfield Himalayan 410', 'motorcycle', 'Royal Enfield', 411.0, 'FI', 'Manual', true, true, 407),
  ('Royal Enfield Himalayan 450', 'motorcycle', 'Royal Enfield', 452.0, 'FI', 'Manual', true, true, 408),
  ('Royal Enfield Hunter 350', 'motorcycle', 'Royal Enfield', 349.0, 'FI', 'Manual', true, true, 409),
  ('Royal Enfield Interceptor 650', 'motorcycle', 'Royal Enfield', 648.0, 'FI', 'Manual', true, true, 410),
  ('Royal Enfield Meteor 350', 'motorcycle', 'Royal Enfield', 349.0, 'FI', 'Manual', true, true, 411),
  ('Royal Enfield Scram 411', 'motorcycle', 'Royal Enfield', 411.0, 'FI', 'Manual', true, true, 412),
  ('Royal Enfield Shotgun 650', 'motorcycle', 'Royal Enfield', 648.0, 'FI', 'Manual', true, true, 413),
  ('Royal Enfield Super Meteor 650', 'motorcycle', 'Royal Enfield', 648.0, 'FI', 'Manual', true, true, 414),

  ('Suzuki Access', 'motorcycle', 'Suzuki', 124.0, 'FI', 'Automatic', true, true, 500),
  ('Suzuki Access Ride Connect Edition', 'motorcycle', 'Suzuki', 124.0, 'FI', 'Automatic', true, true, 501),
  ('Suzuki Avenis', 'motorcycle', 'Suzuki', 124.0, 'FI', 'Automatic', true, true, 502),
  ('Suzuki Burgman 15', 'motorcycle', 'Suzuki', 149.0, 'FI', 'Automatic', true, true, 503),
  ('Suzuki Burgman 400', 'motorcycle', 'Suzuki', 400.0, 'FI', 'Automatic', true, true, 504),
  ('Suzuki Burgman Street', 'motorcycle', 'Suzuki', 124.0, 'FI', 'Automatic', true, true, 505),
  ('Suzuki Burgman Street 125 EX', 'motorcycle', 'Suzuki', 124.0, 'FI', 'Automatic', true, true, 506),
  ('Suzuki DR160', 'motorcycle', 'Suzuki', 162.0, 'FI', 'Manual', true, true, 507),
  ('Suzuki DR-Z4S', 'motorcycle', 'Suzuki', 398.0, 'FI', 'Manual', true, true, 508),
  ('Suzuki DR-Z4SM', 'motorcycle', 'Suzuki', 398.0, 'FI', 'Manual', true, true, 509),
  ('Suzuki GIXXER 155', 'motorcycle', 'Suzuki', 155.0, 'FI', 'Manual', true, true, 510),
  ('Suzuki GIXXER 250', 'motorcycle', 'Suzuki', 249.0, 'FI', 'Manual', true, true, 511),
  ('Suzuki GIXXER SF 155', 'motorcycle', 'Suzuki', 155.0, 'FI', 'Manual', true, true, 512),
  ('Suzuki GIXXER SF250', 'motorcycle', 'Suzuki', 249.0, 'FI', 'Manual', true, true, 513),
  ('Suzuki GN160', 'motorcycle', 'Suzuki', 155.0, 'Carbureted', 'Manual', true, true, 514),
  ('Suzuki GSX-8R', 'motorcycle', 'Suzuki', 776.0, 'FI', 'Manual', true, true, 515),
  ('Suzuki GSX-8S', 'motorcycle', 'Suzuki', 776.0, 'FI', 'Manual', true, true, 516),
  ('Suzuki GSX-8T', 'motorcycle', 'Suzuki', 776.0, 'FI', 'Manual', true, true, 517),
  ('Suzuki GSX-8TT', 'motorcycle', 'Suzuki', 776.0, 'FI', 'Manual', true, true, 518),
  ('Suzuki GSX-R1000', 'motorcycle', 'Suzuki', 999.0, 'FI', 'Manual', true, true, 519),
  ('Suzuki GSX-R1000R', 'motorcycle', 'Suzuki', 999.8, 'FI', 'Manual', true, true, 520),
  ('Suzuki GSX-S1000', 'motorcycle', 'Suzuki', 999.0, 'FI', 'Manual', true, true, 521),
  ('Suzuki GSX-S1000GT', 'motorcycle', 'Suzuki', 999.0, 'FI', 'Manual', true, true, 522),
  ('Suzuki GSX-S1000GX', 'motorcycle', 'Suzuki', 999.0, 'FI', 'Manual', true, true, 523),
  ('Suzuki GSX-S150', 'motorcycle', 'Suzuki', 147.3, 'FI', 'Manual', true, true, 524),
  ('Suzuki Hayabusa', 'motorcycle', 'Suzuki', 1340.0, 'FI', 'Manual', true, true, 525),
  ('Suzuki Raider J Crossover', 'motorcycle', 'Suzuki', 113.0, 'FI', 'Semi-Automatic', true, true, 526),
  ('Suzuki Raider PRO', 'motorcycle', 'Suzuki', 147.3, 'FI', 'Manual', true, true, 527),
  ('Suzuki Raider R150', 'motorcycle', 'Suzuki', 147.3, 'FI', 'Manual', true, true, 528),
  ('Suzuki Raider R150 Fi', 'motorcycle', 'Suzuki', 147.3, 'FI', 'Manual', true, true, 529),
  ('Suzuki RM-Z250', 'motorcycle', 'Suzuki', 249.0, 'FI', 'Manual', true, true, 530),
  ('Suzuki RM-Z450', 'motorcycle', 'Suzuki', 449.0, 'FI', 'Manual', true, true, 531),
  ('Suzuki Skydrive Sport', 'motorcycle', 'Suzuki', 113.0, 'FI', 'Automatic', true, true, 532),
  ('Suzuki Smash Carb', 'motorcycle', 'Suzuki', 109.7, 'Carbureted', 'Semi-Automatic', true, true, 533),
  ('Suzuki Smash Fi', 'motorcycle', 'Suzuki', 113.0, 'FI', 'Semi-Automatic', true, true, 534),
  ('Suzuki SV650', 'motorcycle', 'Suzuki', 645.0, 'FI', 'Manual', true, true, 535),
  ('Suzuki V-STROM 1050DE', 'motorcycle', 'Suzuki', 1037.0, 'FI', 'Manual', true, true, 536),
  ('Suzuki V-STROM 160', 'motorcycle', 'Suzuki', 162.0, 'FI', 'Manual', true, true, 537),
  ('Suzuki V-STROM 250 SX', 'motorcycle', 'Suzuki', 249.0, 'FI', 'Manual', true, true, 538),
  ('Suzuki V-STROM 800DE', 'motorcycle', 'Suzuki', 776.0, 'FI', 'Manual', true, true, 539),

  ('TVS Apache RTR 160', 'motorcycle', 'TVS', 159.7, 'Carbureted', 'Manual', true, true, 600),

  ('Yamaha FZ-S', 'motorcycle', 'Yamaha', 149.0, 'FI', 'Manual', true, true, 700),
  ('Yamaha MT-15', 'motorcycle', 'Yamaha', 155.0, 'FI', 'Manual', true, true, 701),
  ('Yamaha Mio', 'motorcycle', 'Yamaha', 125.0, 'FI', 'Automatic', true, true, 702),
  ('Yamaha NMAX', 'motorcycle', 'Yamaha', 155.0, 'FI', 'Automatic', true, true, 703),
  ('Yamaha R15', 'motorcycle', 'Yamaha', 155.0, 'FI', 'Manual', true, true, 704)
ON CONFLICT (name) DO UPDATE
SET
  category = EXCLUDED.category,
  brand = EXCLUDED.brand,
  engine_cc = EXCLUDED.engine_cc,
  fuel_type = EXCLUDED.fuel_type,
  transmission = EXCLUDED.transmission,
  is_active = EXCLUDED.is_active;

CREATE INDEX IF NOT EXISTS products_motorcycle_catalog_sort_idx
  ON public.products (brand, name)
  WHERE category = 'motorcycle' AND is_archived = false;
