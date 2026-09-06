import { Module } from '@nestjs/common';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { EntriesModule } from '../entries/entries.module';

@Module({
  // Confirming a batch receives its purchases through EntriesService, so stock
  // and expense recognition are not duplicated here.
  imports: [EntriesModule],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
