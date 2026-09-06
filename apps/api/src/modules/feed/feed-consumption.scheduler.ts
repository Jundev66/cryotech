import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FeedService } from './feed.service';

@Injectable()
export class FeedConsumptionScheduler {
  private readonly logger = new Logger(FeedConsumptionScheduler.name);

  constructor(private readonly feedService: FeedService) {}

  @Cron('0 6 * * *') // Every day at 6:00 AM
  async handleDailyFeedGeneration() {
    this.logger.log('Starting daily auto feed consumption generation...');

    try {
      const result = await this.feedService.autoGenerateForAllBatches();
      this.logger.log(
        `Daily feed generation complete: ${result.generated} generated, ${result.skipped} skipped`,
      );
    } catch (error) {
      this.logger.error('Failed to run daily feed generation', error);
    }
  }
}
