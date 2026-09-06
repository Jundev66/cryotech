import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Agent } from 'node:https';

const DEFAULT_BCV_URL = 'https://www.bcv.org.ve/';
const DEFAULT_TIMEOUT_MS = 10000;

// The BCV homepage is served to browsers only; a bare client gets a challenge page.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// A rate outside this band means we parsed the wrong element, not that the
// bolivar moved. Better to fall back to the cached rate than to book a sale
// against a number scraped from the euro block or a page footer.
const MIN_PLAUSIBLE_RATE = 1;
const MAX_PLAUSIBLE_RATE = 100_000;

/**
 * Parses the USD rate out of the BCV homepage.
 *
 * The markup is `<div id="dolar" ...> ... <strong class="strong-tb">757,54060000</strong>`.
 * Note the euro block appears BEFORE the dollar block in the document, so
 * slicing between the two anchors yields an inverted range — always scan
 * forward from `id="dolar"` instead.
 *
 * Exported so it can be checked against a saved fixture without hitting the network.
 */
export function parseBcvRate(html: string): number | null {
  const anchor = html.indexOf('id="dolar"');
  if (anchor === -1) return null;

  // Stay inside the dollar block: the next currency block starts at the next `id="`.
  const nextAnchor = html.indexOf('id="', anchor + 10);
  const block = html.slice(anchor, nextAnchor === -1 ? anchor + 2000 : nextAnchor);

  const match = block.match(/strong-tb[^>]*>\s*([\d.]+,\d+)/);
  if (!match) return null;

  // es-VE formatting: '.' groups thousands, ',' is the decimal separator.
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const rate = Number(normalized);

  if (!Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

@Injectable()
export class BcvScraperProvider {
  private readonly logger = new Logger(BcvScraperProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Scrapes today's official USD rate from the BCV site.
   *
   * Returns null on any failure — network, markup change, or a value that
   * fails the sanity checks. The caller falls back to the last cached rate;
   * it must never fall back to a third-party aggregator, whose lag against
   * the official rate is large enough to cause real losses on a sale.
   *
   * `timeoutMs` overrides the configured budget. The scheduled refresh can
   * afford to wait; a caller with a human on the other end cannot, and there
   * the fallback to yesterday's rate beats ten seconds of silence.
   */
  async fetchRate(
    lastKnownRate?: number | null,
    lastKnownDate?: Date | null,
    timeoutMs?: number,
  ): Promise<number | null> {
    const url = this.configService.get<string>('BCV_URL') ?? DEFAULT_BCV_URL;
    const timeout =
      timeoutMs ?? Number(this.configService.get('BCV_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS);

    // When BCV_URL points at the Worker's /bcv proxy instead of the BCV itself,
    // the proxy demands the same bearer token as the queue does: an open proxy
    // on a free tier is someone else's request quota. Absent, the request goes
    // out exactly as it always has.
    const proxyToken = this.configService.get<string>('BCV_PROXY_TOKEN');

    let html: string;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<string>(url, {
          timeout,
          responseType: 'text',
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            Accept: 'text/html',
            ...(proxyToken ? { Authorization: `Bearer ${proxyToken}` } : {}),
          },
          // bcv.org.ve serves an incomplete certificate chain: Node rejects it
          // with UNABLE_TO_VERIFY_LEAF_SIGNATURE even though browsers and curl
          // accept it. Refusing the page means falling back to a rate that can
          // be months old, and pricing a sale off a stale bolivar rate is a
          // real loss — a worse outcome than not verifying a public page whose
          // only payload is a number we range-check anyway. Still a flag, so
          // the trade-off is visible rather than buried.
          //
          // On a server this flag is not an option: env.schema.ts rejects it
          // under NODE_ENV=production. Point BCV_URL at the Worker's /bcv
          // instead — its runtime accepts the chain, so the trade-off
          // disappears rather than being tolerated.
          ...(this.configService.get('BCV_ALLOW_INSECURE_TLS') === 'true'
            ? { httpsAgent: this.buildInsecureAgent() }
            : {}),
        }),
      );
      html = typeof data === 'string' ? data : String(data);
    } catch (error) {
      this.logger.error(`Failed to fetch BCV page from ${url}`, (error as Error)?.message);
      return null;
    }

    const rate = parseBcvRate(html);
    if (rate === null) {
      this.logger.error('BCV page fetched but the USD rate could not be parsed — markup may have changed');
      return null;
    }

    if (rate < MIN_PLAUSIBLE_RATE || rate > MAX_PLAUSIBLE_RATE) {
      this.logger.error(`Discarding implausible BCV rate: ${rate}`);
      return null;
    }

    // A sudden jump is more likely a parsing error than a real devaluation —
    // but only when measured against a recent baseline. The bolivar can
    // genuinely move 35% over a couple of months, so comparing today's rate to
    // one cached long ago would reject the correct value and keep us on the
    // stale one, which is the exact failure this guard exists to prevent.
    // Allow roughly 2% of drift per day since the baseline, floored at 25%.
    if (lastKnownRate && lastKnownRate > 0) {
      const daysOld = lastKnownDate
        ? Math.max(0, (Date.now() - lastKnownDate.getTime()) / 86_400_000)
        : 1;
      const tolerance = Math.max(0.25, daysOld * 0.02);
      const drift = Math.abs(rate - lastKnownRate) / lastKnownRate;

      if (drift > tolerance) {
        this.logger.error(
          `Discarding BCV rate ${rate}: ${(drift * 100).toFixed(1)}% away from ${lastKnownRate} ` +
            `(${daysOld.toFixed(0)} days old, tolerance ${(tolerance * 100).toFixed(0)}%)`,
        );
        return null;
      }
    }

    this.logger.log(`BCV rate scraped: ${rate}`);
    return rate;
  }

  private buildInsecureAgent() {
    return new Agent({ rejectUnauthorized: false });
  }
}
