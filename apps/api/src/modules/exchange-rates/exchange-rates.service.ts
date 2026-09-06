import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import type { RateSource } from '@prisma/client';
import { BcvScraperProvider } from './providers/bcv-scraper.provider';

export interface CurrentRateResult {
  bcvRate: number;
  parallelRate: number | null;
  effectiveRate: number;
  source: RateSource;
  rateDate: Date;
  unavailable?: boolean;
  /** True when the rate comes from a previous day because today's fetch failed. */
  stale?: boolean;
}

interface FetchedRate {
  bcvRate: number;
  parallelRate: number | null;
  rateDate: Date;
  stale: boolean;
}

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly bcvScraper: BcvScraperProvider,
  ) {}

  /**
   * Resolves today's official USD rate, scraping bcv.org.ve and caching the
   * result in the ExchangeRate table keyed by today's date.
   *
   * The fallback chain is deliberate: today's cache -> live scrape -> most
   * recent cached rate (flagged stale) -> configured floor -> null. It must
   * never fall back to a third-party aggregator: their lag against the
   * official rate runs several bolivares per dollar, which turns into a real
   * loss on every sale priced from it.
   */
  async fetchBcvRate(scrapeTimeoutMs?: number): Promise<FetchedRate | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cached = await this.prisma.exchangeRate.findUnique({
      where: { rateDate: today },
    });

    if (cached) {
      return {
        bcvRate: Number(cached.bcvRate),
        parallelRate: cached.parallelRate ? Number(cached.parallelRate) : null,
        rateDate: cached.rateDate,
        stale: false,
      };
    }

    const lastRate = await this.prisma.exchangeRate.findFirst({
      orderBy: { rateDate: 'desc' },
    });
    const lastKnown = lastRate ? Number(lastRate.bcvRate) : null;

    const scraped = await this.bcvScraper.fetchRate(
      lastKnown,
      lastRate?.rateDate ?? null,
      scrapeTimeoutMs,
    );

    if (scraped !== null) {
      // Concurrent callers can race to write the same day; the unique index on
      // rate_date settles it and both end up reading the same row.
      const row = await this.prisma.exchangeRate.upsert({
        where: { rateDate: today },
        create: {
          rateDate: today,
          bcvRate: new Decimal(scraped),
          parallelRate: null,
          fetchedAt: new Date(),
        },
        update: {},
      });
      return {
        bcvRate: Number(row.bcvRate),
        parallelRate: row.parallelRate ? Number(row.parallelRate) : null,
        rateDate: row.rateDate,
        stale: false,
      };
    }

    if (lastRate) {
      this.logger.warn(
        `Using stale BCV rate from ${lastRate.rateDate.toISOString().slice(0, 10)} — today's scrape failed`,
      );
      return {
        bcvRate: Number(lastRate.bcvRate),
        parallelRate: lastRate.parallelRate ? Number(lastRate.parallelRate) : null,
        rateDate: lastRate.rateDate,
        stale: true,
      };
    }

    const configured = Number(this.configService.get('EXCHANGE_RATE_FALLBACK'));
    if (Number.isFinite(configured) && configured > 0) {
      this.logger.warn(`No cached rate at all — using EXCHANGE_RATE_FALLBACK=${configured}`);
      return { bcvRate: configured, parallelRate: null, rateDate: today, stale: true };
    }

    this.logger.error('No BCV rate available: scrape failed and no cached rate exists');
    return null;
  }

  /**
   * Returns the effective exchange rate for a company based on its config.
   *
   * `scrapeTimeoutMs` caps the live scrape for callers answering a person in
   * real time — see `fetchRate`. Omitted, the configured budget applies.
   */
  async getCurrentRate(
    companyId: string,
    options?: { scrapeTimeoutMs?: number },
  ): Promise<CurrentRateResult> {
    const config = await this.getOrCreateConfig(companyId);

    if (config.rateSource === 'custom') {
      const customRate = config.customRate ? Number(config.customRate) : 0;
      return {
        bcvRate: customRate,
        parallelRate: null,
        effectiveRate: customRate,
        source: 'custom',
        rateDate: new Date(),
      };
    }

    const rates = await this.fetchBcvRate(options?.scrapeTimeoutMs);

    if (!rates) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        bcvRate: 0,
        parallelRate: null,
        effectiveRate: 0,
        source: config.rateSource,
        rateDate: today,
        unavailable: true,
      };
    }

    // The BCV publishes no parallel rate, so a company configured for
    // 'parallel' silently runs on the official one. Say so rather than
    // pretending the configuration is being honoured.
    if (config.rateSource === 'parallel' && rates.parallelRate === null) {
      this.logger.warn(
        `Company ${companyId} is configured for the parallel rate, but only the official BCV rate is available — using BCV`,
      );
    }

    const effectiveRate =
      config.rateSource === 'parallel' && rates.parallelRate !== null
        ? rates.parallelRate
        : rates.bcvRate;

    return {
      bcvRate: rates.bcvRate,
      parallelRate: rates.parallelRate,
      effectiveRate,
      source: config.rateSource,
      rateDate: rates.rateDate,
      ...(rates.stale ? { stale: true } : {}),
    };
  }

  /**
   * Returns the ExchangeRateConfig for a company.
   */
  async getConfig(companyId: string) {
    return this.getOrCreateConfig(companyId);
  }

  /**
   * Upserts the ExchangeRateConfig for a company.
   */
  async updateConfig(
    companyId: string,
    input: {
      rateSource?: RateSource;
      customRate?: number | null;
      autoFetch?: boolean;
    },
  ) {
    return this.prisma.exchangeRateConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        rateSource: input.rateSource ?? 'bcv',
        customRate:
          input.customRate !== undefined && input.customRate !== null
            ? new Decimal(input.customRate)
            : null,
        autoFetch: input.autoFetch ?? true,
      },
      update: {
        ...(input.rateSource !== undefined && {
          rateSource: input.rateSource,
        }),
        ...(input.customRate !== undefined && {
          customRate:
            input.customRate !== null ? new Decimal(input.customRate) : null,
        }),
        ...(input.autoFetch !== undefined && { autoFetch: input.autoFetch }),
      },
    });
  }

  /**
   * Returns the last N days of cached exchange rates.
   */
  async getRateHistory(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    return this.prisma.exchangeRate.findMany({
      where: { rateDate: { gte: since } },
      orderBy: { rateDate: 'desc' },
    });
  }

  /**
   * Gets the config for a company, creating a default one if it doesn't exist.
   */
  private async getOrCreateConfig(companyId: string) {
    const existing = await this.prisma.exchangeRateConfig.findUnique({
      where: { companyId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.exchangeRateConfig.create({
      data: {
        companyId,
        rateSource: 'bcv',
        autoFetch: true,
      },
    });
  }
}
