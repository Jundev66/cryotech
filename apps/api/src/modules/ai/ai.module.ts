import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaudeReceiptExtractor } from './claude.service';
import { FakeReceiptExtractor } from './fake-receipt-extractor.service';
import { RECEIPT_EXTRACTOR } from './receipt-extractor.port';

@Module({
  providers: [
    ClaudeReceiptExtractor,
    FakeReceiptExtractor,
    {
      provide: RECEIPT_EXTRACTOR,
      inject: [ConfigService, ClaudeReceiptExtractor, FakeReceiptExtractor],
      useFactory: (
        config: ConfigService,
        claude: ClaudeReceiptExtractor,
        fake: FakeReceiptExtractor,
      ) => {
        if (config.get('ASSISTANT_FAKE_AI') === 'true') {
          new Logger('AiModule').warn('ASSISTANT_FAKE_AI=true — using the fixture reader, not Claude');
          return fake;
        }
        return claude;
      },
    },
  ],
  exports: [RECEIPT_EXTRACTOR],
})
export class AiModule {}
