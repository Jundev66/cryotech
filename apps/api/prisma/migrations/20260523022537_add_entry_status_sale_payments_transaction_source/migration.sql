-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'partial', 'paid');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('pending', 'received');

-- AlterTable
ALTER TABLE "product_entries" ADD COLUMN     "status" "EntryStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "due_date" DATE,
ADD COLUMN     "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "source_id" UUID,
ADD COLUMN     "source_type" TEXT;

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_bs" DECIMAL(12,2),
    "exchange_rate" DECIMAL(12,4),
    "payment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payments_company_id_idx" ON "sale_payments"("company_id");

-- CreateIndex
CREATE INDEX "product_entries_status_idx" ON "product_entries"("status");

-- CreateIndex
CREATE INDEX "sales_payment_status_idx" ON "sales"("payment_status");

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
