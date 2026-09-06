-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "processings" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "product_entries" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "sequence_counters" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequence_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sequence_counters_company_id_entity_key" ON "sequence_counters"("company_id", "entity");

-- AddForeignKey
ALTER TABLE "sequence_counters" ADD CONSTRAINT "sequence_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
