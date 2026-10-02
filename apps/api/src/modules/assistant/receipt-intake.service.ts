import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { ReceiptReaderService } from '../receipt-ocr/receipt-reader.service';
import type { ReceiptFields } from '../receipt-ocr/patterns';
import { MovementsService } from '../treasury/movements.service';
import { AccountsService } from '../treasury/accounts.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { DirectionResolver } from './resolvers/direction.resolver';
import { ClientResolver, CONFIDENT_MATCH, type ClientResolution } from './resolvers/client.resolver';
import { DraftService } from './drafts/draft.service';
import { SummaryFormatter } from './formatting/summary.formatter';
import { PayablesService } from '../payables/payables.service';
import { todayIn } from './formatting/number.format';
import type { IntakeOutcome } from './queue/receipt-queue.service';
import {
  DRAFT_INTENT,
  type MoneyDirection,
  type OutgoingMessage,
  type ReceiptField,
  type ResolvedReceipt,
} from './types/assistant.types';

const DEFAULT_TIMEZONE = 'America/Caracas';

/**
 * How long a receipt may wait on a live BCV scrape.
 *
 * The configured budget is ten seconds, which is right for the scheduled
 * refresh and wrong here: on a weekend, or before the morning cron has run,
 * that whole ten seconds lands inside somebody's reply. Yesterday's rate
 * flagged as stale is a far better answer than a ten-second pause.
 */
const RECEIPT_RATE_TIMEOUT_MS = 2_500;

export interface IntakeResult {
  receipt: ResolvedReceipt;
  draftId: string | null;
  /** What happened, so a caller handling several images can tally them. */
  outcome: IntakeOutcome;
  /** Rendered immediately; the queue presenter re-renders with its position. */
  reply: OutgoingMessage;
}

/**
 * Turns a receipt screenshot into a pending draft plus the single message the
 * user confirms. Nothing is written to the ledger here — that happens only
 * after the confirmation button is tapped.
 */
@Injectable()
export class ReceiptIntakeService {
  private readonly logger = new Logger(ReceiptIntakeService.name);

  constructor(
    private readonly reader: ReceiptReaderService,
    private readonly directions: DirectionResolver,
    private readonly clients: ClientResolver,
    private readonly movements: MovementsService,
    private readonly accounts: AccountsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly drafts: DraftService,
    private readonly formatter: SummaryFormatter,
    private readonly payables: PayablesService,
    private readonly configService: ConfigService,
  ) {}

  async intake(params: {
    companyId: string;
    channel: string;
    externalUserId: string;
    image: Buffer;
    userId?: string | null;
  }): Promise<IntakeResult> {
    const timeZone = this.configService.get<string>('ASSISTANT_TIMEZONE') ?? DEFAULT_TIMEZONE;
    const todayIso = todayIn(timeZone);
    const today = new Date(`${todayIso}T12:00:00Z`);

    const read = await this.reader.read(params.image, today);
    const { fields } = read;

    const [direction, current, past] = await Promise.all([
      this.directions.resolve(params.companyId, fields.originAccount, fields.destinationAccount),
      this.exchangeRates.getCurrentRate(params.companyId, {
        scrapeTimeoutMs: RECEIPT_RATE_TIMEOUT_MS,
      }),
      fields.date && fields.date < todayIso
        ? this.exchangeRates.getRateForDate(fields.date)
        : Promise.resolve(null),
    ]);

    // A transfer from an earlier day moved bolivares at that day's rate, and
    // that is the rate its dollars have to be worked out with. Only for a
    // company on the official rate: a custom one says to ignore the BCV.
    const rate =
      past && current.source === 'bcv'
        ? { ...current, bcvRate: past.rate, effectiveRate: past.rate, rateDate: past.rateDate, stale: false, unavailable: false }
        : current;

    const warnings: string[] = [];
    if (read.tier === 'ai_image') warnings.push('Leído con el respaldo de imagen');
    if (rate.unavailable) warnings.push('Sin tasa BCV disponible: muestro solo el monto original');

    // The counterparty only becomes a client when money came in; on an outgoing
    // payment they are a supplier, which this system does not model as a client.
    let clientResolution: ClientResolution | null = null;
    if (direction.direction === 'in' && fields.counterparty) {
      clientResolution = await this.clients.resolve(params.companyId, fields.counterparty);
      warnings.push(...clientResolution.warnings.filter((warning) => !warning.startsWith('Cliente nuevo')));
    }

    const duplicate = fields.reference
      ? await this.movements.findByReference(params.companyId, fields.reference)
      : null;

    const awaiting = awaitingFields(fields, direction.direction);

    const receipt: ResolvedReceipt = {
      fields,
      direction,
      tier: read.tier,
      exchangeRate: rate.unavailable ? null : rate.effectiveRate,
      exchangeRateStale: Boolean(rate.stale),
      warnings,
      missing: read.missing,
      duplicateOf: duplicate
        ? {
            id: duplicate.id,
            movementDate: duplicate.movementDate,
            amount: duplicate.amount.toString(),
            accountName: duplicate.account.name,
          }
        : null,
      awaiting,
      client: direction.direction === 'in' ? { confident: isConfident(clientResolution) } : undefined,
    };

    // A duplicate is the one thing that ends here: it is already on the books,
    // and asking anything about it would only invite booking it twice. What the
    // reader could not see — a field, or which account is ours — is asked
    // instead of turning the whole receipt away. It used to be rejected, and
    // with only the free reader that happened often enough to matter.
    if (receipt.duplicateOf) {
      this.logger.log(`Receipt ${fields.reference} already booked — no draft created`);
      return {
        receipt,
        draftId: null,
        outcome: { kind: 'duplicate', reference: fields.reference },
        reply: this.formatter.format(receipt, 'none', todayIso),
      };
    }

    // Only a complete outgoing payment can be matched to what we owe, and only a
    // receipt whose account is unknown needs the account list. Run alongside
    // the draft write rather than after it: the lookups are independent of it.
    const openPayablesPromise =
      direction.direction === 'out' && awaiting.length === 0
        ? this.payables.listOpen(params.companyId)
        : Promise.resolve([]);
    const accountsPromise = awaiting.includes('account')
      ? this.accounts.findAll(params.companyId)
      : Promise.resolve([]);

    const draftPromise = this.drafts.create({
      companyId: params.companyId,
      userId: params.userId ?? null,
      channel: params.channel,
      externalUserId: params.externalUserId,
      intent:
        direction.direction === 'in'
          ? DRAFT_INTENT.RECEIPT_IN
          : direction.direction === 'out'
            ? DRAFT_INTENT.RECEIPT_OUT
            : direction.direction === 'internal'
              ? DRAFT_INTENT.RECEIPT_INTERNAL
              : DRAFT_INTENT.RECEIPT_INCOMPLETE,
      readerTier: read.tier,
      // Keeping the raw read on the draft is what makes a wrong entry
      // diagnosable later; it cannot be reconstructed after the fact.
      rawExtraction: {
        ocrText: read.ocrText.slice(0, 4000),
        ocrConfidence: read.ocrConfidence,
        wasInverted: read.wasInverted,
        usage: read.usage ?? null,
      } as Prisma.InputJsonValue,
      entities: {
        amount: fields.amount,
        currency: fields.currency,
        date: fields.date,
        reference: fields.reference,
        counterparty: fields.counterparty,
        concept: fields.concept,
        bankName: fields.bankName,
        origin: fields.originAccount as unknown as Prisma.InputJsonValue,
        destination: fields.destinationAccount as unknown as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue,
      resolved: {
        direction: direction.direction,
        ourAccountId: direction.ourAccountId,
        // Names too, so a queued receipt can be re-rendered later without
        // hitting the database again.
        ourAccountName: direction.ourAccountName,
        counterAccountName: direction.counterAccountName,
        counterAccountId: direction.counterAccountId,
        exchangeRate: receipt.exchangeRate,
        exchangeRateStale: receipt.exchangeRateStale,
        clientId: clientResolution?.match?.id ?? null,
        clientName: clientResolution?.match?.name ?? null,
        clientIsNew: clientResolution?.isNew ?? false,
        alternativeClientId: clientResolution?.alternative?.id ?? null,
        clientConfident: isConfident(clientResolution),
        awaiting,
      } as Prisma.InputJsonValue,
      warnings,
    });

    // Awaited together so a failing draft write cannot leave a lookup dangling
    // as an unhandled rejection.
    const [draft, openPayables, accounts] = await Promise.all([
      draftPromise,
      openPayablesPromise,
      accountsPromise,
    ]);

    return {
      receipt,
      draftId: draft.id,
      outcome: { kind: 'queued', draftId: draft.id },
      reply: this.formatter.format(
        receipt,
        draft.id,
        todayIso,
        undefined,
        openPayables,
        accounts.map((account) => ({ id: account.id, name: account.name, currency: account.currency })),
      ),
    };
  }
}

/** What has to be asked before the receipt can be classified, first question first. */
function awaitingFields(fields: ReceiptFields, direction: MoneyDirection): ReceiptField[] {
  const awaiting: ReceiptField[] = [];
  if (fields.amount === null) awaiting.push('amount');
  if (!fields.date) awaiting.push('date');
  if (!fields.reference) awaiting.push('reference');
  if (direction === 'unknown') awaiting.push('direction', 'account');
  return awaiting;
}

/**
 * Sure enough to apply a payment to this client without asking.
 *
 * A close runner-up is doubt too: two Josés on the books must not be decided by
 * how the bank happened to spell one of them.
 */
function isConfident(resolution: ClientResolution | null): boolean {
  return Boolean(resolution?.match && resolution.match.score >= CONFIDENT_MATCH && !resolution.alternative);
}
