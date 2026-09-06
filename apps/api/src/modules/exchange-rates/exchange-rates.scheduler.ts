import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExchangeRatesService } from './exchange-rates.service';

/**
 * Warms the daily rate cache so no user-facing operation pays the latency of
 * scraping bcv.org.ve. Runs twice on weekdays: shortly after the BCV usually
 * publishes, and again in the afternoon in case the morning run failed.
 */
@Injectable()
export class ExchangeRatesScheduler {
  private readonly logger = new Logger(ExchangeRatesScheduler.name);

  constructor(private readonly exchangeRates: ExchangeRatesService) {}

  @Cron('5 9 * * 1-5', { timeZone: 'America/Caracas' })
  async warmMorning() {
    await this.refresh('morning');
  }

  @Cron('0 14 * * 1-5', { timeZone: 'America/Caracas' })
  async warmAfternoon() {
    await this.refresh('afternoon');
  }

  private async refresh(label: string) {
    try {
      const result = await this.exchangeRates.fetchBcvRate();
      if (!result) {
        this.logger.error(`Scheduled BCV refresh (${label}) produced no rate`);
        return;
      }
      this.logger.log(
        `Scheduled BCV refresh (${label}): ${result.bcvRate}${result.stale ? ' [stale]' : ''}`,
      );
    } catch (error) {
      this.logger.error(`Scheduled BCV refresh (${label}) threw`, error as Error);
    }
  }
}
