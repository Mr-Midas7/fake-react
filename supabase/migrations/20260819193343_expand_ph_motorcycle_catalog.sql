-- Expand Philippines motorcycle catalog: add localized brands and models
-- These represent popular motorcycle models in the Philippine market

INSERT INTO public.products (name, category, brand, description, price, in_stock, is_featured, sort_order)
SELECT * FROM (
  VALUES
  ('Honda CB150R','motorcycle','Honda','Streetfighter 150cc with aggressive styling.',129000.00,true,true,10),
  ('Honda Beat','motorcycle','Honda','Popular underbone 110cc for daily commuting.',79000.00,true,true,11),
  ('Honda PCX160','motorcycle','Honda','Popular underbone 158cc for daily commuting.',119000.00,true,true,12),
  ('Yamaha Mio','motorcycle','Yamaha','125cc underbone, the king of city rides.',78000.00,true,true,13),
  ('Yamaha NMAX','motorcycle','Yamaha','155cc automatic scooter for urban commuters.',125000.00,true,true,14),
  ('Yamaha MT-15','motorcycle','Yamaha','Naked 155cc with aggressive styling.',135000.00,true,true,15),
  ('Yamaha R15','motorcycle','Yamaha','155cc sport bike with VVA engine.',149000.00,true,false,16),
  ('Suzuki GSX-S150','motorcycle','Suzuki','150cc sporty streetfighter.',119000.00,true,true,18),
  ('Kawasaki Z150','motorcycle','Kawasaki','150cc street naked with sharp styling.',124000.00,true,false,20),
  ('KTM 125 Duke','motorcycle','KTM','125cc naked with race-bred handling.',185000.00,true,false,21),
  ('Royal Enfield Classic 350','motorcycle','Royal Enfield','350cc classic cruiser with modern fuel injection.',225000.00,true,false,22),
  ('TVS Apache RTR 160','motorcycle','TVS','160cc sporty naked with race-tuned engine.',98000.00,true,false,23)
) AS v(name, category, brand, description, price, in_stock, is_featured, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.name = v.name AND p.category = 'motorcycle'
);

-- Rename Yamaha WR155R (less common PH model) to Yamaha FZ-S (popular PH model)
UPDATE public.products
SET name = 'Yamaha FZ-S', description = '250cc naked with sharp styling.'
WHERE name = 'Yamaha WR155R' AND brand = 'Yamaha' AND category = 'motorcycle';
