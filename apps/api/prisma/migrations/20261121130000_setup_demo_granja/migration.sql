-- Ensure demo@cryotech.com exists
INSERT INTO "users" ("id", "email", "password_hash", "full_name", "created_at", "updated_at")
VALUES (
  '11111111-1111-4111-a111-111111111111',
  'demo@cryotech.com',
  '$2b$12$kz0ArFvymdAzHgc06SnbBuXp5XQ/xSIEWB4EJLM6RBH2X.N/0MSJG',
  'Usuario Demo',
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO UPDATE
SET "email" = 'demo@cryotech.com',
    "full_name" = 'Usuario Demo',
    "password_hash" = '$2b$12$kz0ArFvymdAzHgc06SnbBuXp5XQ/xSIEWB4EJLM6RBH2X.N/0MSJG',
    "updated_at" = NOW();

-- Remove demo user from ZZ Empresa de Pruebas so it has its own clean tenant
DELETE FROM "company_members"
WHERE "user_id" = '11111111-1111-4111-a111-111111111111'
  AND "company_id" = '25aacb04-877b-4db0-a9dc-e3f8eb95675d';

-- Create or update dedicated clean company Granja Demo
INSERT INTO "companies" ("id", "owner_id", "name", "phone", "address", "is_demo", "expires_at", "created_at", "updated_at")
VALUES (
  '33333333-3333-4333-a333-333333333333',
  '11111111-1111-4111-a111-111111111111',
  'Granja Demo',
  '+58 412 0000000',
  'Carretera Nacional, Sector El Rosal, Galpón Demo',
  false,
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO UPDATE
SET "name" = 'Granja Demo',
    "owner_id" = '11111111-1111-4111-a111-111111111111',
    "is_demo" = false,
    "expires_at" = NULL;

-- Create default Admin role for Granja Demo
INSERT INTO "roles" ("id", "company_id", "name", "permissions", "created_at")
VALUES (
  '44444444-4444-4444-a444-444444444441',
  '33333333-3333-4333-a333-333333333333',
  'Administrador',
  '{"batches":{"view":true,"create":true,"edit":true,"delete":true},"daily_logs":{"view":true,"create":true,"edit":true,"delete":true},"sales":{"view":true,"create":true,"edit":true,"delete":true},"transactions":{"view":true,"create":true,"edit":true,"delete":true},"entries":{"view":true,"create":true,"edit":true,"delete":true},"processing":{"view":true,"create":true,"edit":true,"delete":true},"clients":{"view":true,"create":true,"edit":true,"delete":true},"products":{"view":true,"create":true,"edit":true,"delete":true},"warehouses":{"view":true,"create":true,"edit":true,"delete":true},"reports":{"view":true},"settings":{"view":true,"edit":true},"users":{"view":true,"create":true,"edit":true,"delete":true}}'::jsonb,
  NOW()
)
ON CONFLICT ("id") DO UPDATE
SET "name" = 'Administrador',
    "permissions" = '{"batches":{"view":true,"create":true,"edit":true,"delete":true},"daily_logs":{"view":true,"create":true,"edit":true,"delete":true},"sales":{"view":true,"create":true,"edit":true,"delete":true},"transactions":{"view":true,"create":true,"edit":true,"delete":true},"entries":{"view":true,"create":true,"edit":true,"delete":true},"processing":{"view":true,"create":true,"edit":true,"delete":true},"clients":{"view":true,"create":true,"edit":true,"delete":true},"products":{"view":true,"create":true,"edit":true,"delete":true},"warehouses":{"view":true,"create":true,"edit":true,"delete":true},"reports":{"view":true},"settings":{"view":true,"edit":true},"users":{"view":true,"create":true,"edit":true,"delete":true}}'::jsonb;

-- Link demo user to Granja Demo as owner
INSERT INTO "company_members" ("id", "company_id", "user_id", "role_id", "is_owner", "created_at")
VALUES (
  '55555555-5555-4555-a555-555555555555',
  '33333333-3333-4333-a333-333333333333',
  '11111111-1111-4111-a111-111111111111',
  '44444444-4444-4444-a444-444444444441',
  true,
  NOW()
)
ON CONFLICT ("id") DO UPDATE
SET "company_id" = '33333333-3333-4333-a333-333333333333',
    "user_id" = '11111111-1111-4111-a111-111111111111',
    "role_id" = '44444444-4444-4444-a444-444444444441',
    "is_owner" = true;

-- Default measurement units for Granja Demo
INSERT INTO "measurement_units" ("id", "company_id", "name", "abbreviation", "created_at")
VALUES
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Kilogramos', 'kg', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Gramos', 'g', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Litros', 'L', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Mililitros', 'mL', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Unidades', 'unid', NOW())
ON CONFLICT DO NOTHING;

-- Default product categories for Granja Demo
INSERT INTO "product_category_configs" ("id", "company_id", "name", "slug", "created_at")
VALUES
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Alimento', 'feed', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Pollos Bebé', 'chicks', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Vacuna', 'vaccine', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Suplemento', 'supplement', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Equipo', 'equipment', NOW()),
  (gen_random_uuid(), '33333333-3333-4333-a333-333333333333', 'Otro', 'other', NOW())
ON CONFLICT DO NOTHING;
