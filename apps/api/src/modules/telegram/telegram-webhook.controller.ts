import { Body, Controller, ForbiddenException, Headers, HttpCode, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramTransportService } from './telegram-transport.service';
import { telegramUpdateSchema } from './telegram.schema';
import { AssistantInboundService } from '../assistant/inbound/assistant-inbound.service';

/** The header Telegram echoes back from `setWebhook`. */
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/**
 * Where Telegram delivers.
 *
 * Unlike WhatsApp there is no Cloudflare buffer in front: Telegram authenticates
 * with a shared secret rather than an HMAC over the raw body, it holds an
 * undelivered update for 24 hours on its own, and the API already has a public
 * URL on Render. A queue in between would only add a hop to lose things in.
 */
@Controller('telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly transport: TelegramTransportService,
    private readonly inbound: AssistantInboundService,
  ) {}

  /**
   * Answers 200 immediately and does the work afterwards.
   *
   * Reading a receipt takes seconds and a cold start on Render's free tier can
   * take a minute — well past the point where Telegram gives up waiting and
   * redelivers. Answering first turns that into no retry at all, and the
   * duplicates that do arrive are caught by the unique index on
   * (channel, external_id) in the ledger.
   */
  @Post('webhook')
  @HttpCode(200)
  receive(@Headers(SECRET_HEADER) secret: string | undefined, @Body() body: unknown) {
    const expected = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? '';
    // No secret configured means the endpoint is not in service. Answering 403
    // rather than accepting anything keeps an unconfigured deploy from becoming
    // an open door.
    if (!expected || !timingSafeEqual(secret ?? '', expected)) {
      throw new ForbiddenException();
    }

    const parsed = telegramUpdateSchema.safeParse(body);
    if (!parsed.success) {
      // Deliberately not a 400: Telegram retries anything that is not 2xx, and
      // a payload that fails to parse now will fail to parse forever. Swallow
      // it, loudly.
      this.logger.warn(`Discarding unparseable update: ${parsed.error.issues[0]?.message}`);
      return { ok: true };
    }

    const envelope = this.transport.receive(parsed.data);
    if (envelope) void this.inbound.handle(envelope);

    return { ok: true };
  }
}

/**
 * Constant-time string comparison.
 *
 * `===` on a secret leaks its prefix through timing. Compares the full length
 * of both strings regardless, and folds the length difference into the result
 * rather than returning early on it.
 */
function timingSafeEqual(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
