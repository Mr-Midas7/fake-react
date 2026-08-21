-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated admin users to upload/select/update/delete objects in the products bucket
INSERT INTO storage.objects (bucket_id, name, owner, created_at, updated_at, path_tokens)
SELECT 'products', '', NULL, now(), now(), ARRAY[]::text[]
WHERE FALSE;

-- Policies for the products storage bucket
DROP POLICY IF EXISTS "products admin upload" ON storage.objects;
CREATE POLICY "products admin upload" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "products admin update" ON storage.objects;
CREATE POLICY "products admin update" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "products admin delete" ON storage.objects;
CREATE POLICY "products admin delete" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "products public read" ON storage.objects;
CREATE POLICY "products public read" ON storage.objects
FOR SELECT TO anon, authenticated USING (bucket_id = 'products');
