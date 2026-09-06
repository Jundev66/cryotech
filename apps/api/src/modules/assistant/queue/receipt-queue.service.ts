import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BotDraft } from '@prisma/client';
import { DraftService } from '../drafts/draft.service';
import { SummaryFormatter } from '../formatting/summary.formatter';
import { PayablesService } from '../../payables/payables.service';
import { todayIn } from '../formatting/number.format';
import type { ReceiptFields } from '../../receipt-ocr/patterns';
import type { OutgoingMessage, ResolvedReceipt } from '../types/assistant.types';

const DEFAULT_TIMEZONE = 'America/Caracas';

/** Outcome of reading one image, before anything is shown to the user. */
export type IntakeOutcome =
  | { kind: 'queued'; draftId: string }
  | { kind: 'duplicate'; reference: string | null }
  | { kind: 'unreadable'; missing: string[] }
  | { kind: 'unknown_account' };

/**
 * Owns what the user sees when several receipts arrive at once.
 *
 * Sending five screenshots in a row should produce one message, not five: five
 * separate summaries interleave unreadably and, once Meta starts charging for
 * service messages, cost five times as much. So the batch is acknowledged once
 * and the queue is walked one receipt at a time.
 */
@Injectable()
export class ReceiptQueueService {
  constructor(
    private readonly drafts: DraftService,
    private readonly formatter: SummaryFormatter,
    private readonly payables: PayablesService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Builds the single reply for a batch of images: a tally of what happened,
   * then the first receipt waiting to be classified.
   */
  async summarizeBatch(
    channel: string,
    externalUserId: string,
    outcomes: IntakeOutcome[],
  ): Promise<OutgoingMessage | null> {
    if (outcomes.length === 0) return null;

    const queued = outcomes.filter((o) => o.kind === 'queued').length;
    const duplicates = outcomes.filter((o) => o.kind === 'duplicate');
    const unreadable = outcomes.filter((o) => o.kind === 'unreadable');
    const unknown = outcomes.filter((o) => o.kind === 'unknown_account').length;

    const header: string[] = [];

    // A single receipt does not need a tally — it just gets shown.
    if (outcomes.length > 1) {
      header.push(`Recibí ${outcomes.length} comprobantes:`);
      if (queued > 0) header.push(`  ✓ ${queued} por clasificar`);
      for (const duplicate of duplicates) {
        header.push(`  ⚠️ ya registrado${duplicate.reference ? ` · ref ${duplicate.reference}` : ''}`);
      }
      for (const bad of unreadable) {
        header.push(`  ✗ no pude leer ${bad.missing.map(fieldLabel).join(', ')}`);
      }
      if (unknown > 0) header.push(`  ✗ ${unknown} de cuentas que no son tuyas`);
      header.push('');
    } else {
      // Single receipt that did not make it into the queue: say why.
      const [only] = outcomes;
      if (only.kind === 'duplicate') {
        return {
          text: `⚠️ Ese comprobante ya está registrado${only.reference ? ` (ref ${only.reference})` : ''}. No registré nada nuevo.`,
        };
      }
      if (only.kind === 'unreadable') {
        return { text: `No pude leer ${only.missing.map(fieldLabel).join(', ')} del comprobante.` };
      }
      if (only.kind === 'unknown_account') {
        return {
          text: 'Ninguna de las cuentas de ese comprobante está registrada como tuya. Agrégala en Tesorería y vuelve a enviarlo.',
        };
      }
    }

    const next = await this.presentNext(channel, externalUserId);
    if (!next) {
      return header.length > 0 ? { text: header.join('\n').trim() } : null;
    }

    return {
      // The trailing '' in `header` plus this newline is what separates the
      // tally from the receipt with a blank line on the phone.
      text: header.length > 0 ? `${header.join('\n')}\n${next.text}` : next.text,
      buttons: next.buttons,
    };
  }

  /**
   * Renders the oldest receipt still waiting, with its place in the queue.
   * Returns null when there is nothing left — the caller then says nothing
   * rather than sending an empty "all done" message nobody asked for.
   */
  async presentNext(channel: string, externalUserId: string): Promise<OutgoingMessage | null> {
    const pending = await this.drafts.listPending(channel, externalUserId);
    if (pending.length === 0) return null;

    const [first] = pending;
    const timeZone = this.configService.get<string>('ASSISTANT_TIMEZONE') ?? DEFAULT_TIMEZONE;
    const receipt = rebuildReceipt(first);

    // Read fresh rather than stored on the draft: a receipt can sit in the queue
    // for days, and by then a payable it matched may already be settled.
    const openPayables =
      receipt.direction.direction === 'out'
        ? await this.payables.listOpen(first.companyId)
        : [];

    return this.formatter.format(
      receipt,
      first.id,
      todayIn(timeZone),
      { index: 1, total: pending.length },
      openPayables,
    );
  }

  /** Short line appended after an operation, so the queue keeps moving. */
  async remainingNote(channel: string, externalUserId: string): Promise<string> {
    const remaining = await this.drafts.countPending(channel, externalUserId);
    if (remaining === 0) return '';
    return remaining === 1
      ? '\n\nQueda 1 comprobante por clasificar.'
      : `\n\nQuedan ${remaining} comprobantes por clasificar.`;
  }
}

/**
 * Rebuilds the summary input from what was stored on the draft.
 *
 * The draft keeps the extracted fields and the resolution, which is everything
 * the formatter needs — so a receipt can be re-rendered at any point in the
 * queue without re-reading the image or calling the model again.
 */
export function rebuildReceipt(draft: BotDraft): ResolvedReceipt {
  const entities = draft.entities as Record<string, unknown>;
  const resolved = (draft.resolved ?? {}) as Record<string, unknown>;
  const warnings = Array.isArray(draft.warnings) ? (draft.warnings as string[]) : [];

  const fields: ReceiptFields = {
    amount: (entities.amount as number) ?? null,
    currency: (entities.currency as 'VES' | 'USD') ?? null,
    date: (entities.date as string) ?? null,
    reference: (entities.reference as string) ?? null,
    counterparty: (entities.counterparty as string) ?? null,
    originAccount: (entities.origin as ReceiptFields['originAccount']) ?? null,
    destinationAccount: (entities.destination as ReceiptFields['destinationAccount']) ?? null,
    concept: (entities.concept as string) ?? null,
    bankName: (entities.bankName as string) ?? null,
  };

  return {
    fields,
    direction: {
      direction: (resolved.direction as ResolvedReceipt['direction']['direction']) ?? 'unknown',
      ourAccountId: (resolved.ourAccountId as string) ?? null,
      ourAccountName: (resolved.ourAccountName as string) ?? null,
      counterAccountId: (resolved.counterAccountId as string) ?? null,
      counterAccountName: (resolved.counterAccountName as string) ?? null,
    },
    tier: (draft.readerTier as ResolvedReceipt['tier']) ?? 'ocr',
    exchangeRate: (resolved.exchangeRate as number) ?? null,
    exchangeRateStale: false,
    warnings,
    missing: [],
    duplicateOf: null,
  };
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    amount: 'el monto',
    reference: 'la referencia',
    date: 'la fecha',
    account: 'las cuentas',
  };
  return labels[field] ?? field;
}
