/*
  Warnings:

  - You are about to drop the column `feed_consumed_kg` on the `daily_logs` table. All the data in the column will be lost.
  - You are about to drop the column `feed_product_id` on the `daily_logs` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "daily_logs" DROP CONSTRAINT "daily_logs_feed_product_id_fkey";

-- AlterTable
ALTER TABLE "daily_logs" DROP COLUMN "feed_consumed_kg",
DROP COLUMN "feed_product_id";

-- AlterTable
ALTER TABLE "feed_consumptions" ADD COLUMN     "is_auto_generated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT;
