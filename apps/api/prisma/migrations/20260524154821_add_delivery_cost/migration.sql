-- AlterTable
ALTER TABLE "batch_entry_lines" ADD COLUMN     "delivery_cost" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "product_entries" ADD COLUMN     "delivery_cost" DECIMAL(12,2);
