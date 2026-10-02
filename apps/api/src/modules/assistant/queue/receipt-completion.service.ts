import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BotDraft, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountsService } from '../../treasury/accounts.service';
import { MovementsService } from '../../treasury/movements.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { ReportsService } from '../../reports/reports.service';
import { DraftService } from '../drafts/draft.service';
import { ClientResolver, CONFIDENT_MATCH } from '../resolvers/client.resolver';
import { SummaryFormatter, type ClientChoice } from '../formatting/summary.formatter';
import { formatUsd, parseLocalNumber, todayIn } from '../formatting/number.format';
import { DRAFT_INTENT, type OutgoingMessage, type ReceiptField } from '../types/assistant.types';
import { ReceiptQueueService, awaitingOf } from './receipt-queue.service';

const DEFAULT_TIMEZONE = 'America/Caracas';
/** As far back as the date question offers, and as far as a receipt may be dated. */
const MAX_DAYS_BACK = 60;

/**
 * A message that is nothing but an amount: "1.250,50", "20$", "Bs 300".
 *
 * Anchored on purpose. While a receipt waits for its amount, the user may just
 * as well type "gasto 20$ gasoil" — that is a new operation, not the answer,
 * and taking its 20 as the receipt's amount would be a silent wrong entry.
 */
const AMOUNT_ONLY = /^\s*(bs\.?|\$|usd)?\s*\d[\d.,]*\s*(bs\.?|\$|usd|d[oó]lares?|bol[ií]vares?)?\s*$/i;

/** A bank reference as people type it: digits, maybe letters, spaces or dashes in between. */
const REFERENCE_ONLY = /^[A-Za-z0-9][A-Za-z0-9 .-]{2,38}[A-Za-z0-9]$/;

/**
 * Fills in what the reader could not see on a receipt, one answer at a time.
 *
 * Only the free OCR reads receipts now, and a dark screenshot or a bank layout
 * it does not know leaves a field blank. Turning the whole receipt away over
 * that made the user register it by hand; asking for the one missing figure
 * keeps it a photo and a tap or two.
 *
 * Nothing here writes to the ledger. Each answer only completes the draft, and
 * the receipt is then offered exactly as a fully read one would have been.
 */
@Injectable()
export class ReceiptCompletionService {
  private readonly logger = new Logger(ReceiptCompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: DraftService,
    private readonly queue: ReceiptQueueService,
    private readonly accounts: AccountsService,
    private readonly movements: MovementsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly reports: ReportsService,
    private readonly clients: ClientResolver,
    private readonly formatter: SummaryFormatter,
    private readonly configService: ConfigService,
  ) {}

  /**
   * A typed answer to the receipt on screen, if it is waiting for one.
   *
   * Returns null when the text is not an answer — no receipt waiting for a
   * typed field, or text that does not look like one — so the caller handles
   * it as it would any other message.
   */
  async answerText(
    companyId: string,
    channel: string,
    externalUserId: string,
    text: string,
  ): Promise<OutgoingMessage | null> {
    const draft = await this.drafts.findPending(channel, externalUserId);
    if (!draft || draft.companyId !== companyId) return null;

    const field = awaitingOf(draft)[0];

    if (field === 'amount' && AMOUNT_ONLY.test(text)) {
      const value = parseLocalNumber(text);
      if (value === null || value <= 0) {
        return this.again(draft, `⚠️ No entendí "${text.trim()}" como monto. Escribe solo la cifra, por ejemplo 1.250,50.`);
      }
      const currency = /\$|usd|d[oó]lar/i.test(text) ? 'USD' : /bs|bol[ií]var/i.test(text) ? 'VES' : null;
      return this.apply(draft, { field: 'amount', amount: value, currency });
    }

    if (field === 'reference' && REFERENCE_ONLY.test(text.trim()) && (text.match(/\d/g)?.length ?? 0) >= 4) {
      return this.apply(draft, { field: 'reference', reference: text.replace(/[\s.-]/g, '') });
    }

    return null;
  }

  /** A tapped answer: `date=…`, `reference=none`, `direction=in|out`, `account=<id>`. */
  async answerButton(companyId: string, draftId: string, raw: string): Promise<OutgoingMessage | null> {
    const separator = raw.indexOf('=');
    if (separator < 0) return null;
    const field = raw.slice(0, separator) as ReceiptField;
    const value = raw.slice(separator + 1);

    const draft = await this.drafts.findById(companyId, draftId);
    if (!draft || draft.status !== 'pending' || draft.expiresAt <= new Date()) return null;

    // Only the question being asked: a tap on an old copy of it is a no-op,
    // like any other stale button.
    if (awaitingOf(draft)[0] !== field) return null;

    switch (field) {
      case 'date': {
        const todayIso = this.today();
        const earliest = shiftDays(todayIso, -MAX_DAYS_BACK);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > todayIso || value < earliest) return null;
        return this.apply(draft, { field: 'date', date: value });
      }
      case 'reference':
        return value === 'none' ? this.apply(draft, { field: 'reference', reference: null }) : null;
      case 'direction':
        return value === 'in' || value === 'out' ? this.apply(draft, { field: 'direction', direction: value }) : null;
      case 'account': {
        const account = await this.prisma.account.findFirst({
          where: { id: value, companyId, isActive: true },
          select: { id: true, name: true },
        });
        if (!account) return this.again(draft, '⚠️ Esa cuenta ya no está disponible. Elige otra.');
        return this.apply(draft, { field: 'account', account });
      }
      default:
        return null;
    }
  }

  /**
   * The clients a receipt's payment can go to, after "Cobro de venta".
   *
   * Whoever the name on the receipt resembled comes first, then everyone who
   * owes, most owed first.
   */
  async clientChoices(companyId: string, draftId: string): Promise<OutgoingMessage | null> {
    const draft = await this.drafts.findById(companyId, draftId);
    if (!draft || draft.status !== 'pending' || draft.expiresAt <= new Date()) return null;

    const entities = draft.entities as Record<string, unknown>;
    const resolved = (draft.resolved ?? {}) as Record<string, unknown>;
    const nameOnReceipt = (entities.counterparty as string | null) ?? null;

    const receivables = await this.reports.getReceivablesByClient(companyId);
    const owing = receivables.clients.filter((client) => client.clientId);
    const byId = new Map(owing.map((client) => [client.clientId as string, client]));

    const choices: ClientChoice[] = [];
    const add = (id: string | null | undefined, note: (owed: number) => string) => {
      if (!id || choices.some((choice) => choice.id === id)) return;
      const client = byId.get(id);
      if (!client) return;
      choices.push({ id, name: client.clientName, note: note(client.owedUsd) });
    };

    for (const id of [resolved.clientId, resolved.alternativeClientId] as Array<string | null>) {
      add(id, (owed) => `Parecido al de la captura · debe ${formatUsd(owed)}`);
    }
    for (const client of owing) {
      add(client.clientId, (owed) => `Debe ${formatUsd(owed)}`);
    }

    return this.formatter.clientPicker(draft.id, choices, nameOnReceipt);
  }

  private async apply(draft: BotDraft, answer: Answer): Promise<OutgoingMessage | null> {
    const entities = { ...(draft.entities as Record<string, unknown>) };
    const resolved = { ...((draft.resolved ?? {}) as Record<string, unknown>) };
    let intent = draft.intent;

    switch (answer.field) {
      case 'amount':
        entities.amount = answer.amount;
        entities.currency = answer.currency ?? (entities.currency as string | null) ?? 'VES';
        break;

      case 'date': {
        entities.date = answer.date;
        // The bolivares moved at that day's rate, not today's.
        if (answer.date < this.today()) {
          const past = await this.exchangeRates.getRateForDate(answer.date);
          if (past) {
            resolved.exchangeRate = past.rate;
            resolved.exchangeRateStale = false;
          }
        }
        break;
      }

      case 'reference': {
        entities.reference = answer.reference;
        if (answer.reference) {
          // The same check the reader does on a reference it found itself.
          const duplicate = await this.movements.findByReference(draft.companyId, answer.reference);
          if (duplicate) {
            await this.drafts.cancel(draft.companyId, draft.id);
            this.logger.log(`Typed reference ${answer.reference} already booked — draft ${draft.id} discarded`);
            const next = await this.queue.presentNext(draft.channel, draft.externalUserId);
            const notice =
              `⚠️ La referencia ${answer.reference} ya está registrada en ${duplicate.account.name}. ` +
              'Descarté este comprobante para no contarlo dos veces.';
            return next ? { text: `${notice}\n\n${next.text}`, buttons: next.buttons } : { text: notice };
          }
        }
        break;
      }

      case 'direction':
        resolved.direction = answer.direction;
        intent = answer.direction === 'in' ? DRAFT_INTENT.RECEIPT_IN : DRAFT_INTENT.RECEIPT_OUT;
        break;

      case 'account':
        resolved.ourAccountId = answer.account.id;
        resolved.ourAccountName = answer.account.name;
        break;
    }

    const awaiting = awaitingOf(draft).filter((field) => field !== answer.field);
    resolved.awaiting = awaiting;

    // Money in whose direction was only just learned has not been matched to a
    // client yet: the reader only does that when it knows the money came in.
    if (awaiting.length === 0 && resolved.direction === 'in' && resolved.clientConfident === undefined) {
      const name = entities.counterparty as string | null;
      const resolution = name ? await this.clients.resolve(draft.companyId, name) : null;
      resolved.clientId = resolution?.match?.id ?? null;
      resolved.clientName = resolution?.match?.name ?? null;
      resolved.clientIsNew = resolution?.isNew ?? false;
      resolved.alternativeClientId = resolution?.alternative?.id ?? null;
      resolved.clientConfident = Boolean(
        resolution?.match && resolution.match.score >= CONFIDENT_MATCH && !resolution.alternative,
      );
    }

    // Conditional on still being pending, so an answer racing a "Descartar"
    // cannot bring a discarded receipt back.
    const { count } = await this.prisma.botDraft.updateMany({
      where: { id: draft.id, companyId: draft.companyId, status: 'pending' },
      data: {
        intent,
        entities: entities as Prisma.InputJsonValue,
        resolved: resolved as Prisma.InputJsonValue,
      },
    });
    if (count === 0) return null;

    return (await this.queue.presentNext(draft.channel, draft.externalUserId)) ?? { text: 'Listo.' };
  }

  /** The same question again, with a note on top saying what was wrong. */
  private async again(draft: BotDraft, note: string): Promise<OutgoingMessage> {
    const current = await this.queue.presentNext(draft.channel, draft.externalUserId);
    return current ? { text: `${note}\n\n${current.text}`, buttons: current.buttons } : { text: note };
  }

  private today(): string {
    return todayIn(this.configService.get<string>('ASSISTANT_TIMEZONE') ?? DEFAULT_TIMEZONE);
  }
}

type Answer =
  | { field: 'amount'; amount: number; currency: 'USD' | 'VES' | null }
  | { field: 'date'; date: string }
  | { field: 'reference'; reference: string | null }
  | { field: 'direction'; direction: 'in' | 'out' }
  | { field: 'account'; account: { id: string; name: string } };

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
