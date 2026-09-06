-- CreateTable
CREATE TABLE "bot_flow_sessions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "external_user_id" TEXT NOT NULL,
    "flow_kind" TEXT NOT NULL,
    "flow_token" TEXT NOT NULL,
    "context" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result_type" TEXT,
    "result_id" UUID,
    "error_message" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_flow_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_flow_sessions_flow_token_key" ON "bot_flow_sessions"("flow_token");

-- CreateIndex
CREATE INDEX "bot_flow_sessions_channel_external_user_id_status_idx" ON "bot_flow_sessions"("channel", "external_user_id", "status");

-- AddForeignKey
ALTER TABLE "bot_flow_sessions" ADD CONSTRAINT "bot_flow_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
