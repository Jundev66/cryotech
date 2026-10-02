import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DigestService } from './digest.service';
import { DraftService } from '../drafts/draft.service';

/**
 * When the summaries go out, in Caracas time.
 *
 * On a free Render instance these only fire while the process is awake; the
 * Worker's ten-minute ping (services/webhook-buffer/wrangler.toml) is what
 * keeps it so.
 */
@Injectable()
export class DigestScheduler {
  private readonly logger = new Logger(DigestScheduler.name);

  constructor(
    private readonly digest: DigestService,
    private readonly drafts: DraftService,
  ) {}

  /** End of the working day: today's numbers while they can still be checked. */
  @Cron('0 19 * * *', { timeZone: 'America/Caracas' })
  async daily() {
    await this.run('daily', () => this.digest.sendDaily());
  }

  /** Monday morning: who to chase this week. */
  @Cron('0 7 * * 1', { timeZone: 'America/Caracas' })
  async weekly() {
    await this.run('weekly', () => this.digest.sendWeekly());
  }

  /**
   * Marks drafts past their time as expired.
   *
   * Reads already ignore them; this is what makes the table say so, rather than
   * showing receipts as "pending" forever.
   */
  @Cron('30 3 * * *', { timeZone: 'America/Caracas' })
  async expireDrafts() {
    await this.run('expire-drafts', async () => {
      const count = await this.drafts.expireStale();
      if (count > 0) this.logger.log(`Expired ${count} stale draft(s)`);
    });
  }

  private async run(label: string, job: () => Promise<void>) {
    try {
      await job();
    } catch (error) {
      this.logger.error(`Scheduled ${label} failed`, error as Error);
    }
  }
}
