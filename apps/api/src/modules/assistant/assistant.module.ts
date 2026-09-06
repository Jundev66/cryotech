import { Module } from '@nestjs/common';
import { ReceiptOcrModule } from '../receipt-ocr/receipt-ocr.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { SalesModule } from '../sales/sales.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PayablesModule } from '../payables/payables.module';
import { ReportsModule } from '../reports/reports.module';
import { DailyLogsModule } from '../daily-logs/daily-logs.module';
import { BatchesModule } from '../batches/batches.module';
import { EntriesModule } from '../entries/entries.module';
import { ProcessingModule } from '../processing/processing.module';
import { AssistantService } from './assistant.service';
import { AssistantInboundService } from './inbound/assistant-inbound.service';
import { ChannelRegistryService } from './inbound/channel-registry.service';
import { IdentityService } from './inbound/identity.service';
import { InboundMessageService } from './inbound/inbound-message.service';
import { MenuService } from './menu/menu.service';
import { FlowService } from './flows/flow.service';
import { FlowSessionService } from './flows/flow-session.service';
import { FlowDataService } from './flows/flow-data.service';
import { FlowSubmissionService } from './flows/flow-submission.service';
import { WizardService } from './wizard/wizard.service';
import { ReceiptIntakeService } from './receipt-intake.service';
import { ReceiptExecutorService } from './executors/receipt-executor.service';
import { DirectionResolver } from './resolvers/direction.resolver';
import { ClientResolver } from './resolvers/client.resolver';
import { DraftService } from './drafts/draft.service';
import { ReceiptQueueService } from './queue/receipt-queue.service';
import { SummaryFormatter } from './formatting/summary.formatter';
import { AssistantDevController } from './assistant-dev.controller';

/**
 * Channel-agnostic core. It never imports a transport, so adding one (Telegram,
 * a web inbox) means writing an adapter that produces IncomingMessage and
 * renders OutgoingMessage — nothing in here changes.
 *
 * `inbound/` is the seam: a transport pushes an InboundEnvelope in and
 * registers a ChannelSender to be answered through. Idempotency, the allowlist,
 * the dispatch by message kind and the receipt batching all live on this side,
 * so they cannot drift between channels.
 */
@Module({
  imports: [
    ReceiptOcrModule,
    TreasuryModule,
    ExchangeRatesModule,
    SalesModule,
    TransactionsModule,
    // Payables so a receipt can settle what it actually paid for; Reports so
    // the menu can answer "who owes me" without a second implementation.
    PayablesModule,
    ReportsModule,
    // The forms write through the same services the web uses, so a sale filed
    // from a phone lands in exactly the same shape as one filed at a desk.
    DailyLogsModule,
    BatchesModule,
    EntriesModule,
    ProcessingModule,
  ],
  // The simulate controller is the fastest way to exercise the whole pipeline
  // without Meta in the loop; it refuses to mount in production.
  controllers: process.env.NODE_ENV === 'production' ? [] : [AssistantDevController],
  providers: [
    AssistantService,
    AssistantInboundService,
    ChannelRegistryService,
    IdentityService,
    InboundMessageService,
    ReceiptIntakeService,
    ReceiptExecutorService,
    DirectionResolver,
    ClientResolver,
    DraftService,
    ReceiptQueueService,
    SummaryFormatter,
    MenuService,
    FlowService,
    FlowSessionService,
    FlowDataService,
    FlowSubmissionService,
    WizardService,
  ],
  exports: [
    AssistantService,
    AssistantInboundService,
    ChannelRegistryService,
    ReceiptIntakeService,
    DraftService,
    ReceiptQueueService,
  ],
})
export class AssistantModule {}
