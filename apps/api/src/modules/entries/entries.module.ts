import { Module } from '@nestjs/common';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';
import { PayablesModule } from '../payables/payables.module';

@Module({
  // Payables owns everything about paying a purchase; this module only owns
  // receiving one.
  imports: [PayablesModule],
  controllers: [EntriesController],
  providers: [EntriesService],
  exports: [EntriesService],
})
export class EntriesModule {}
