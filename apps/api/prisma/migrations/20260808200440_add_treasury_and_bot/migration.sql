-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('bank', 'cash', 'digital');

-- CreateEnum
CREATE TYPE "AccountCurrency" AS ENUM ('VES', 'USD');

-- CreateEnum
CREATE TYPE "MovementDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "AccountIdentifierKind" AS ENUM ('last4', 'phone', 'document');

-- CreateEnum
CREATE TYPE "BotDraftStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "BotInboundStatus" AS ENUM ('received', 'processed', 'ignored', 'failed');

-- AlterTable
ALTER TABLE "sale_payments" ADD COLUMN     "account_id" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "account_id" UUID;

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "currency" "AccountCurrency" NOT NULL,
    "current_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_identifiers" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "kind" "AccountIdentifierKind" NOT NULL,
    "value" TEXT NOT NULL,
    "bank_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_movements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "direction" "MovementDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "AccountCurrency" NOT NULL,
    "movement_date" DATE NOT NULL,
    "reference" TEXT,
    "counterparty" TEXT,
    "concept" TEXT,
    "source_type" TEXT,
    "source_id" UUID,
    "transfer_group_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_trades" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT,
    "trade_date" DATE NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount_from" DECIMAL(14,2) NOT NULL,
    "amount_to" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_drafts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "external_user_id" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "status" "BotDraftStatus" NOT NULL DEFAULT 'pending',
    "reader_tier" TEXT,
    "raw_extraction" JSONB,
    "entities" JSONB NOT NULL,
    "resolved" JSONB,
    "warnings" JSONB,
    "result_type" TEXT,
    "result_id" UUID,
    "error_message" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_inbound_messages" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "status" "BotInboundStatus" NOT NULL DEFAULT 'received',
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "bot_inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_company_id_is_active_idx" ON "accounts"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "account_identifiers_account_id_idx" ON "account_identifiers"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_identifiers_kind_value_bank_code_key" ON "account_identifiers"("kind", "value", "bank_code");

-- CreateIndex
CREATE INDEX "account_movements_company_id_account_id_movement_date_idx" ON "account_movements"("company_id", "account_id", "movement_date");

-- CreateIndex
CREATE INDEX "account_movements_transfer_group_id_idx" ON "account_movements"("transfer_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_movements_company_id_reference_key" ON "account_movements"("company_id", "reference");

-- CreateIndex
CREATE INDEX "fx_trades_company_id_trade_date_idx" ON "fx_trades"("company_id", "trade_date");

-- CreateIndex
CREATE INDEX "bot_drafts_company_id_status_idx" ON "bot_drafts"("company_id", "status");

-- CreateIndex
CREATE INDEX "bot_drafts_channel_external_user_id_status_idx" ON "bot_drafts"("channel", "external_user_id", "status");

-- CreateIndex
CREATE INDEX "bot_inbound_messages_external_user_id_idx" ON "bot_inbound_messages"("external_user_id");

-- CreateIndex
CREATE INDEX "bot_inbound_messages_status_received_at_idx" ON "bot_inbound_messages"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "bot_inbound_messages_channel_external_id_key" ON "bot_inbound_messages"("channel", "external_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_identifiers" ADD CONSTRAINT "account_identifiers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_trades" ADD CONSTRAINT "fx_trades_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_trades" ADD CONSTRAINT "fx_trades_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fx_trades" ADD CONSTRAINT "fx_trades_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_drafts" ADD CONSTRAINT "bot_drafts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
