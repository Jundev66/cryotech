-- AlterTable
ALTER TABLE "daily_logs" ADD COLUMN     "feed_consumed_kg" DECIMAL(10,3),
ADD COLUMN     "feed_product_id" UUID,
ADD COLUMN     "medicine_product_id" UUID,
ADD COLUMN     "medicine_quantity" DECIMAL(10,3);

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_medicine_product_id_fkey" FOREIGN KEY ("medicine_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_feed_product_id_fkey" FOREIGN KEY ("feed_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
