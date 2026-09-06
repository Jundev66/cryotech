-- AlterTable
ALTER TABLE "product_entries" ADD COLUMN     "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "supplier_name" TEXT;

-- CreateTable
CREATE TABLE "entry_payments" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_usd" DECIMAL(12,2),
    "exchange_rate" DECIMAL(12,4),
    "account_id" UUID,
    "reference" TEXT,
    "payment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entry_payments_entry_id_idx" ON "entry_payments"("entry_id");

-- CreateIndex
CREATE INDEX "entry_payments_company_id_idx" ON "entry_payments"("company_id");

-- CreateIndex
CREATE INDEX "product_entries_company_id_payment_status_idx" ON "product_entries"("company_id", "payment_status");

-- AddForeignKey
ALTER TABLE "entry_payments" ADD CONSTRAINT "entry_payments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "product_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_payments" ADD CONSTRAINT "entry_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_payments" ADD CONSTRAINT "entry_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
