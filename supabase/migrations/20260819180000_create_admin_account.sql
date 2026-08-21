-- Create the pre-seeded admin account (email: admin@gmail.com, password: admin123)
-- Uses a pre-computed bcrypt hash so pgcrypto is not required at migration time

-- Only insert if the user doesn't already exist
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid AS instance_id,
  gen_random_uuid() AS id,
  'authenticated' AS aud,
  'authenticated' AS role,
  'admin@gmail.com' AS email,
  '$2a$12$fRGSzQw5vY/AjVSh9t0K3evMKOtcvSTEls1/URDIUbH4OH53/Q1c6' AS encrypted_password,
  now() AS email_confirmed_at,
  now() AS invited_at,
  now() AS created_at,
  now() AS updated_at,
  '{"provider":"email","providers":["email"]}'::jsonb AS raw_app_meta_data,
  '{}'::jsonb AS raw_user_meta_data,
  false AS is_super_admin
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'admin@gmail.com'
);

-- Grant admin role to the user
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'admin@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
