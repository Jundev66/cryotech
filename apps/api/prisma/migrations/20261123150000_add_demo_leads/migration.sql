-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('erp_landing', 'erp_login', 'pwa_mobile');
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'converted', 'discarded');

-- CreateTable
CREATE TABLE IF NOT EXISTS "demo_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255),
    "farm_size" VARCHAR(50),
    "source" "LeadSource" NOT NULL DEFAULT 'erp_landing',
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "ip_hash" VARCHAR(64),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "demo_leads_created_at_idx" ON "demo_leads"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "demo_leads_email_idx" ON "demo_leads"("email");
CREATE INDEX IF NOT EXISTS "demo_leads_phone_idx" ON "demo_leads"("phone");
