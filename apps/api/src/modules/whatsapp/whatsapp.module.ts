import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AssistantModule } from '../assistant/assistant.module';
import { WhatsappMetaService } from './whatsapp-meta.service';
import { WhatsappTransportService } from './whatsapp-transport.service';
import { WhatsappPollerService } from './whatsapp-poller.service';

/**
 * WhatsApp transport. No conversational logic lives here — it translates
 * between Meta's wire format and the assistant core, and pulls the inbound
 * queue from the Cloudflare buffer.
 *
 * There is no webhook controller: Meta talks to the Worker, and this side only
 * makes outbound calls.
 */
@Module({
  imports: [HttpModule, AssistantModule],
  providers: [WhatsappMetaService, WhatsappTransportService, WhatsappPollerService],
  exports: [WhatsappMetaService],
})
export class WhatsappModule {}
