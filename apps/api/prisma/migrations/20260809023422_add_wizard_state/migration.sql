-- AlterTable
ALTER TABLE "bot_flow_sessions" ADD COLUMN     "answers" JSONB,
ADD COLUMN     "step" INTEGER NOT NULL DEFAULT 0;
