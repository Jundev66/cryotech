import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FeedService } from './feed.service';

@Injectable()
export class FeedConsumptionScheduler {
  private readonly logger = new Logger(FeedConsumptionScheduler.name);

  constructor(private readonly feedService: FeedService) {}

  // 6:00 in Caracas. Without the zone it ran at 6:00 of wherever the server
  // is — 2:00 on a UTC host, before the day's logs could exist.
  @Cron('0 6 * * *', { timeZone: 'America/Caracas' })
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
