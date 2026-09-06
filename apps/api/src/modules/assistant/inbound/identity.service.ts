import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Identity {
  companyId: string;
  /** The sender's id on their channel, in that channel's canonical form. */
  externalUserId: string;
}

/**
 * Which channel reads which allowlist, and how short an entry may be.
 *
 * A phone is E.164 without '+', so ten digits is the floor below which an entry
 * is a typo rather than a number. A Telegram id is a plain integer that has
 * grown over the years — old accounts have short ones — so the floor is only
 * high enough to reject an empty field or a stray comma.
 */
const ALLOWLISTS: Record<string, { variable: string; minLength: number }> = {
  whatsapp: { variable: 'ASSISTANT_ALLOWED_PHONES', minLength: 10 },
  telegram: { variable: 'ASSISTANT_ALLOWED_TELEGRAM_IDS', minLength: 5 },
};

/**
 * Decides whether an incoming sender is allowed to operate the farm's books.
 *
 * Replaces the previous email + verification-code flow, which sent the code to
 * whichever WhatsApp had typed the email — so anyone who knew a registered
 * address could attach their phone to that company. An allowlist has no such
 * hole and needs no UI.
 */
@Injectable()
export class IdentityService implements OnModuleInit {
  private readonly logger = new Logger(IdentityService.name);
  private readonly allowed = new Map<string, Set<string>>();
  private companyId: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    for (const [channel, { variable, minLength }] of Object.entries(ALLOWLISTS)) {
      const raw = this.configService.get<string>(variable) ?? '';
      const entries = raw
        .split(',')
        .map((entry) => normalizeExternalId(entry))
        .filter((entry) => entry.length >= minLength);
      this.allowed.set(channel, new Set(entries));

      // Not a warning per channel: running Telegram only, or WhatsApp only, is
      // a normal configuration and should not look like a misconfiguration.
      this.logger.log(`Channel "${channel}": ${entries.length} sender(s) allowed`);
    }

    this.companyId = this.configService.get<string>('ASSISTANT_COMPANY_ID') ?? null;

    if ([...this.allowed.values()].every((set) => set.size === 0)) {
      this.logger.warn('No allowlist is populated — every incoming message will be ignored');
    }
    if (!this.companyId) {
      this.logger.warn('ASSISTANT_COMPANY_ID is not set — the assistant cannot register anything');
    }
  }

  /**
   * Returns null for anything not on the list. The caller answers nothing at
   * all: staying silent costs no outbound message and does not confirm to a
   * stranger that the account is live.
   */
  resolve(channel: string, externalUserId: string): Identity | null {
    if (!this.companyId) return null;

    const list = this.allowed.get(channel);
    if (!list) {
      this.logger.warn(`No allowlist configured for channel "${channel}" — ignoring its messages`);
      return null;
    }

    const normalized = normalizeExternalId(externalUserId);

    // Full-id match. This used to compare only the last 10 digits of a phone so
    // that a country-code prefix would not matter — but the channel always
    // delivers E.164, so the prefix is never actually missing, and suffix
    // matching meant a number in another country sharing those 10 digits could
    // operate the books. The convenience was for a case that does not occur;
    // the exposure was real.
    if (list.has(normalized)) {
      return { companyId: this.companyId, externalUserId: normalized };
    }

    // Only the last four digits are logged: enough to recognise your own id in
    // the log, not enough to hand out someone else's.
    this.logger.warn(
      `Ignoring message from unauthorised ${channel} sender ending in ${normalized.slice(-4)}`,
    );
    return null;
  }
}

/**
 * Digits only.
 *
 * Both channels identify a sender with a number — E.164 without '+' for
 * WhatsApp, a plain integer for Telegram — so this strips the punctuation a
 * human leaves in an env var (`+58 412-555-0000`) without touching either form.
 */
export function normalizeExternalId(raw: string): string {
  return raw.replace(/\D/g, '');
}
