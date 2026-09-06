import { Global, Module } from '@nestjs/common';
import { SequenceService } from './sequence.service';
import { ProcessedStockService } from './processed-stock.service';

@Global()
@Module({
  providers: [SequenceService, ProcessedStockService],
  exports: [SequenceService, ProcessedStockService],
})
export class SequenceModule {}
