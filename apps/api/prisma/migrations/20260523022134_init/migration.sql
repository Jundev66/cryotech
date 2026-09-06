-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('planned', 'breeding', 'for_sale', 'finished');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('consumable', 'equipment');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('feed', 'vaccine', 'sale_live', 'sale_dead', 'processing', 'utility', 'labor', 'transport', 'other');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('live', 'dead');

-- CreateEnum
CREATE TYPE "FeedPhase" AS ENUM ('inicio', 'engorde');

-- CreateEnum
CREATE TYPE "ConsumptionStatus" AS ENUM ('pending', 'confirmed', 'adjusted');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('bcv', 'parallel', 'custom');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "tax_id" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID,
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "location" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "breed" TEXT NOT NULL,
    "start_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" DATE,
    "initial_quantity" INTEGER NOT NULL,
    "current_quantity" INTEGER NOT NULL,
    "purchase_price_per_unit" DECIMAL(10,2),
    "status" "BatchStatus" NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "log_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feed_consumed_kg" DECIMAL(10,3),
    "feed_product_id" UUID,
    "water_consumed_l" DECIMAL(10,3),
    "mortality" INTEGER NOT NULL DEFAULT 0,
    "average_weight_g" DECIMAL(10,2),
    "temperature_c" DECIMAL(5,2),
    "humidity_pct" DECIMAL(5,2),
    "medicine_administered" BOOLEAN NOT NULL DEFAULT false,
    "medicine_notes" TEXT,
    "health_score" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_units" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "product_type" "ProductType" NOT NULL DEFAULT 'consumable',
    "unit_id" UUID NOT NULL,
    "current_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "batch_id" UUID,
    "company_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "category" "TransactionCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_bs" DECIMAL(12,2),
    "exchange_rate" DECIMAL(12,4),
    "description" TEXT,
    "transaction_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "client_id" UUID,
    "sale_type" "SaleType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "weight_kg" DECIMAL(10,2),
    "price_per_kg" DECIMAL(10,2),
    "price_per_unit" DECIMAL(10,2),
    "total_amount" DECIMAL(12,2) NOT NULL,
    "price_per_kg_bs" DECIMAL(10,2),
    "total_amount_bs" DECIMAL(12,2),
    "exchange_rate" DECIMAL(12,4),
    "sale_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_formulas" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "breed" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "daily_feed_per_bird_g" DECIMAL(8,2) NOT NULL,
    "feed_phase" "FeedPhase",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_consumptions" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID,
    "consumption_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity_kg" DECIMAL(10,3) NOT NULL,
    "adjusted_quantity_kg" DECIMAL(10,3),
    "is_auto_calculated" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConsumptionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_entries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "cost_per_unit" DECIMAL(10,2),
    "total_cost" DECIMAL(12,2),
    "entry_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_entry_lines" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "cost_per_unit" DECIMAL(10,2),
    "notes" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "live_weight_kg" DECIMAL(10,2),
    "processed_weight_kg" DECIMAL(10,2),
    "weight_adjustment_g" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "is_self_processed" BOOLEAN NOT NULL DEFAULT false,
    "cost_per_bird" DECIMAL(10,2),
    "cost_per_kg" DECIMAL(10,2),
    "total_cost" DECIMAL(12,2) NOT NULL,
    "total_cost_bs" DECIMAL(12,2),
    "exchange_rate" DECIMAL(12,4),
    "product_id" UUID,
    "processing_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_consumptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "consumption_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(12,3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_phase_configs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "breed" TEXT NOT NULL,
    "engorde_start_week" INTEGER NOT NULL DEFAULT 4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_phase_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate_configs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "rate_source" "RateSource" NOT NULL DEFAULT 'bcv',
    "custom_rate" DECIMAL(12,4),
    "auto_fetch" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rate_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "rate_date" DATE NOT NULL,
    "bcv_rate" DECIMAL(12,4) NOT NULL,
    "parallel_rate" DECIMAL(12,4),
    "fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "user_id" UUID,
    "company_id" UUID,
    "verification_code" TEXT,
    "code_expires_at" TIMESTAMP(3),
    "conversation_state" TEXT NOT NULL DEFAULT 'idle',
    "state_data" JSONB,
    "is_linked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_company_id_name_key" ON "roles"("company_id", "name");

-- CreateIndex
CREATE INDEX "company_members_user_id_idx" ON "company_members"("user_id");

-- CreateIndex
CREATE INDEX "company_members_company_id_idx" ON "company_members"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_members_company_id_user_id_key" ON "company_members"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "warehouses_company_id_idx" ON "warehouses"("company_id");

-- CreateIndex
CREATE INDEX "batches_company_id_idx" ON "batches"("company_id");

-- CreateIndex
CREATE INDEX "batches_warehouse_id_idx" ON "batches"("warehouse_id");

-- CreateIndex
CREATE INDEX "batches_status_idx" ON "batches"("status");

-- CreateIndex
CREATE INDEX "daily_logs_batch_id_idx" ON "daily_logs"("batch_id");

-- CreateIndex
CREATE INDEX "daily_logs_log_date_idx" ON "daily_logs"("log_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_batch_id_log_date_key" ON "daily_logs"("batch_id", "log_date");

-- CreateIndex
CREATE INDEX "clients_company_id_idx" ON "clients"("company_id");

-- CreateIndex
CREATE INDEX "measurement_units_company_id_idx" ON "measurement_units"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_company_id_abbreviation_key" ON "measurement_units"("company_id", "abbreviation");

-- CreateIndex
CREATE INDEX "product_categories_company_id_idx" ON "product_categories"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_company_id_slug_key" ON "product_categories"("company_id", "slug");

-- CreateIndex
CREATE INDEX "products_company_id_idx" ON "products"("company_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_unit_id_idx" ON "products"("unit_id");

-- CreateIndex
CREATE INDEX "transactions_batch_id_idx" ON "transactions"("batch_id");

-- CreateIndex
CREATE INDEX "transactions_company_id_idx" ON "transactions"("company_id");

-- CreateIndex
CREATE INDEX "transactions_transaction_date_idx" ON "transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "sales_batch_id_idx" ON "sales"("batch_id");

-- CreateIndex
CREATE INDEX "sales_company_id_idx" ON "sales"("company_id");

-- CreateIndex
CREATE INDEX "sales_sale_date_idx" ON "sales"("sale_date");

-- CreateIndex
CREATE UNIQUE INDEX "feed_formulas_company_id_breed_week_number_feed_phase_key" ON "feed_formulas"("company_id", "breed", "week_number", "feed_phase");

-- CreateIndex
CREATE INDEX "feed_consumptions_batch_id_idx" ON "feed_consumptions"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "feed_consumptions_batch_id_consumption_date_key" ON "feed_consumptions"("batch_id", "consumption_date");

-- CreateIndex
CREATE INDEX "product_entries_company_id_idx" ON "product_entries"("company_id");

-- CreateIndex
CREATE INDEX "product_entries_product_id_idx" ON "product_entries"("product_id");

-- CreateIndex
CREATE INDEX "product_entries_batch_id_idx" ON "product_entries"("batch_id");

-- CreateIndex
CREATE INDEX "batch_entry_lines_batch_id_idx" ON "batch_entry_lines"("batch_id");

-- CreateIndex
CREATE INDEX "processings_company_id_idx" ON "processings"("company_id");

-- CreateIndex
CREATE INDEX "processings_batch_id_idx" ON "processings"("batch_id");

-- CreateIndex
CREATE INDEX "product_consumptions_company_id_idx" ON "product_consumptions"("company_id");

-- CreateIndex
CREATE INDEX "product_consumptions_batch_id_idx" ON "product_consumptions"("batch_id");

-- CreateIndex
CREATE INDEX "product_consumptions_product_id_idx" ON "product_consumptions"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "feed_phase_configs_company_id_breed_key" ON "feed_phase_configs"("company_id", "breed");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_configs_company_id_key" ON "exchange_rate_configs"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_rate_date_key" ON "exchange_rates"("rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_phone_number_key" ON "whatsapp_sessions"("phone_number");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_feed_product_id_fkey" FOREIGN KEY ("feed_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_units" ADD CONSTRAINT "measurement_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "measurement_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_formulas" ADD CONSTRAINT "feed_formulas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_consumptions" ADD CONSTRAINT "feed_consumptions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_consumptions" ADD CONSTRAINT "feed_consumptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_consumptions" ADD CONSTRAINT "feed_consumptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_entries" ADD CONSTRAINT "product_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_entries" ADD CONSTRAINT "product_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_entries" ADD CONSTRAINT "product_entries_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_entry_lines" ADD CONSTRAINT "batch_entry_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_entry_lines" ADD CONSTRAINT "batch_entry_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_consumptions" ADD CONSTRAINT "product_consumptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_consumptions" ADD CONSTRAINT "product_consumptions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_consumptions" ADD CONSTRAINT "product_consumptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_phase_configs" ADD CONSTRAINT "feed_phase_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rate_configs" ADD CONSTRAINT "exchange_rate_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
