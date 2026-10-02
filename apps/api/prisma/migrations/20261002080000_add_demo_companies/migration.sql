-- AlterTable
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "companies_is_demo_expires_at_idx" ON "companies"("is_demo", "expires_at");

-- Update zz-pruebas password in production so it can log in
UPDATE "users"
SET "password_hash" = '$2b$12$d5mKzy9WDSpoPTkRkTWAtOuSiewezrH9W9dZeTY2R0yBu7krzQSwO'
WHERE "email" = 'zz-pruebas@cryotech.test';

-- Also insert demo@cryotech.com if not exists
INSERT INTO "users" ("id", "email", "password_hash", "full_name", "created_at", "updated_at")
VALUES (
  '11111111-1111-4111-a111-111111111111',
  'demo@cryotech.com',
  '$2b$12$kz0ArFvymdAzHgc06SnbBuXp5XQ/xSIEWB4EJLM6RBH2X.N/0MSJG',
  'Usuario de Prueba',
  NOW(),
  NOW()
)
ON CONFLICT ("email") DO UPDATE
SET "password_hash" = '$2b$12$kz0ArFvymdAzHgc06SnbBuXp5XQ/xSIEWB4EJLM6RBH2X.N/0MSJG';

-- Ensure ZZ Empresa de Pruebas exists
INSERT INTO "companies" ("id", "owner_id", "name", "created_at", "updated_at")
VALUES (
  '25aacb04-877b-4db0-a9dc-e3f8eb95675d',
  '11111111-1111-4111-a111-111111111111',
  'ZZ Empresa de Pruebas',
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

-- Link demo user to ZZ Empresa de Pruebas as member
INSERT INTO "company_members" ("id", "company_id", "user_id", "is_owner", "created_at")
VALUES (
  '22222222-2222-4222-a222-222222222222',
  '25aacb04-877b-4db0-a9dc-e3f8eb95675d',
  '11111111-1111-4111-a111-111111111111',
  true,
  NOW()
)
ON CONFLICT ("company_id", "user_id") DO NOTHING;

-- Ensure warehouse exists in ZZ Empresa de Pruebas
INSERT INTO "warehouses" ("id", "company_id", "code", "name", "capacity", "is_main", "created_at", "updated_at")
VALUES (
  '093597ed-cc47-4100-8eed-5887b62f7c37',
  '25aacb04-877b-4db0-a9dc-e3f8eb95675d',
  'GALPON-01',
  'Galpón 1 (Pruebas)',
  5000,
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

-- Ensure batch exists in ZZ Empresa de Pruebas
INSERT INTO "batches" ("id", "company_id", "warehouse_id", "code", "breed", "start_date", "initial_quantity", "current_quantity", "status", "created_at", "updated_at")
VALUES (
  'ab3f996e-3ec4-4535-a476-7bd39e54a5d9',
  '25aacb04-877b-4db0-a9dc-e3f8eb95675d',
  '093597ed-cc47-4100-8eed-5887b62f7c37',
  'LOTE-TEST-01',
  'Cobb 500',
  CURRENT_DATE,
  2500,
  2470,
  'breeding',
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;
