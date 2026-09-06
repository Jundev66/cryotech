import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AssistantModule } from '../assistant/assistant.module';
import { TelegramApiService } from './telegram-api.service';
import { TelegramCallbackService } from './telegram-callback-data';
import { TelegramTransportService } from './telegram-transport.service';
import { TelegramWebhookController } from './telegram-webhook.controller';

/**
 * Telegram transport. No conversational logic lives here — it translates
 * between Telegram's wire format and the assistant core.
 *
 * Why a second channel at all: Meta will not release WhatsApp Flows, or a
 * verified display name, from a business without legal registration, and the
 * farm has none. Telegram asks for a token and nothing else.
 */
@Module({
  imports: [HttpModule, AssistantModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramApiService, TelegramCallbackService, TelegramTransportService],
  exports: [TelegramApiService],
})
export class TelegramModule {}
