/*
  Warnings:

  - You are about to drop the `entry_payments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "entry_payments" DROP CONSTRAINT "entry_payments_account_id_fkey";

-- DropForeignKey
ALTER TABLE "entry_payments" DROP CONSTRAINT "entry_payments_company_id_fkey";

-- DropForeignKey
ALTER TABLE "entry_payments" DROP CONSTRAINT "entry_payments_entry_id_fkey";

-- AlterTable
ALTER TABLE "processings" ADD COLUMN     "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "supplier_name" TEXT;

-- DropTable
DROP TABLE "entry_payments";

-- CreateTable
CREATE TABLE "payable_payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "entry_id" UUID,
    "processing_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_usd" DECIMAL(12,2),
    "exchange_rate" DECIMAL(12,4),
    "account_id" UUID,
    "reference" TEXT,
    "payment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payable_payments_entry_id_idx" ON "payable_payments"("entry_id");

-- CreateIndex
CREATE INDEX "payable_payments_processing_id_idx" ON "payable_payments"("processing_id");

-- CreateIndex
CREATE INDEX "payable_payments_company_id_idx" ON "payable_payments"("company_id");

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "product_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_processing_id_fkey" FOREIGN KEY ("processing_id") REFERENCES "processings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
