import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { ReceiptReaderService } from '../receipt-ocr/receipt-reader.service';
import { MovementsService } from '../treasury/movements.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { DirectionResolver } from './resolvers/direction.resolver';
import { ClientResolver } from './resolvers/client.resolver';
import { DraftService } from './drafts/draft.service';
import { SummaryFormatter } from './formatting/summary.formatter';
import { PayablesService } from '../payables/payables.service';
import { todayIn } from './formatting/number.format';
import type { IntakeOutcome } from './queue/receipt-queue.service';
import {
  DRAFT_INTENT,
  type OutgoingMessage,
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

    const [direction, rate] = await Promise.all([
      this.directions.resolve(params.companyId, fields.originAccount, fields.destinationAccount),
      this.exchangeRates.getCurrentRate(params.companyId, {
        scrapeTimeoutMs: RECEIPT_RATE_TIMEOUT_MS,
      }),
    ]);

    const warnings: string[] = [];
    if (read.tier === 'ai_image') warnings.push('Leído con el respaldo de imagen');
    if (read.tier === 'failed') warnings.push('No se pudo leer el comprobante completo');
    if (rate.unavailable) warnings.push('Sin tasa BCV disponible: muestro solo el monto original');

    // The counterparty only becomes a client when money came in; on an outgoing
    // payment they are a supplier, which this system does not model as a client.
    let clientResolution = null;
    if (direction.direction === 'in' && fields.counterparty) {
      clientResolution = await this.clients.resolve(params.companyId, fields.counterparty);
      warnings.push(...clientResolution.warnings);
    }

    const duplicate = fields.reference
      ? await this.movements.findByReference(params.companyId, fields.reference)
      : null;

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
    };

    // A duplicate, an unreadable field or an unknown account all end the same
    // way: report and stop. Creating a draft there would let the user confirm
    // something we cannot execute.
    const cannotProceed =
      receipt.duplicateOf !== null ||
      receipt.missing.length > 0 ||
      direction.direction === 'unknown';

    if (cannotProceed) {
      if (receipt.duplicateOf) {
        this.logger.log(`Receipt ${fields.reference} already booked — no draft created`);
      }
      const outcome: IntakeOutcome = receipt.duplicateOf
        ? { kind: 'duplicate', reference: fields.reference }
        : read.missing.length > 0
          ? { kind: 'unreadable', missing: read.missing }
          : { kind: 'unknown_account' };

      return {
        receipt,
        draftId: null,
        outcome,
        reply: this.formatter.format(receipt, 'none', todayIso),
      };
    }

    // Only an outgoing payment can settle something we owe, so the lookup is
    // skipped entirely for money coming in. Run alongside the draft write
    // rather than after it: the two are independent, and queueing them cost a
    // round trip on every single receipt.
    const openPayablesPromise =
      direction.direction === 'out'
        ? this.payables.listOpen(params.companyId)
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
            : DRAFT_INTENT.RECEIPT_INTERNAL,
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
        clientId: clientResolution?.match?.id ?? null,
        clientName: clientResolution?.match?.name ?? null,
        clientIsNew: clientResolution?.isNew ?? false,
        alternativeClientId: clientResolution?.alternative?.id ?? null,
      } as Prisma.InputJsonValue,
      warnings,
    });

    // Awaited together so a failing draft write cannot leave the payables
    // lookup dangling as an unhandled rejection.
    const [draft, openPayables] = await Promise.all([draftPromise, openPayablesPromise]);

    return {
      receipt,
      draftId: draft.id,
      outcome: { kind: 'queued', draftId: draft.id },
      reply: this.formatter.format(receipt, draft.id, todayIso, undefined, openPayables),
    };
  }
}
