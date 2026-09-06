import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedConsumptionScheduler } from './feed-consumption.scheduler';

@Module({
  controllers: [FeedController],
  providers: [FeedService, FeedConsumptionScheduler],
  exports: [FeedService],
})
export class FeedModule {}
