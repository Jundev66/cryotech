import { Injectable } from '@nestjs/common';
import { TRANSACTION_CATEGORY_LABELS } from '@cryotech/shared-types';
import { formatBs, formatUsd, formatAmount, formatReceiptDate } from './number.format';
import {
  BUTTON,
  buildButtonId,
  type OutgoingMessage,
  type ReplyButton,
  type ResolvedReceipt,
} from '../types/assistant.types';
import type { OpenPayable } from '../../payables/payables.types';

/**
 * Expense categories, offered only as a last resort.
 *
 * Picking one books a brand-new expense, which is right for a bill and wrong
 * for anything the system already knows about. Paying Bs 2.450 for a processing
 * job that was already recorded got filed here as "servicios" and the cost ended
 * up on the books twice — hence the operations above it.
 */
export const EXPENSE_CATEGORY_CHOICES = [
  'feed',
  'chicks',
  'vaccine',
  'utility',
  'labor',
  'transport',
  'other',
] as const;

/** How close a receipt has to be to a balance to be offered as "this one". */
const AMOUNT_MATCH_TOLERANCE = 0.5;

/**
 * How long a payable stays "the one you just registered".
 *
 * Registering a purchase and photographing its receipt is one act split over
 * two messages, and the amounts often do not match to the bolivar — a partial
 * payment, or a receipt that rounds. Recency is what ties them together when
 * the figure cannot.
 */
const JUST_REGISTERED_MS = 30 * 60_000;

@Injectable()
export class SummaryFormatter {
  /**
   * Renders the one message the user sees after sending a receipt.
   *
   * Emits more than three buttons when the choice needs it; turning that into
   * a WhatsApp list is the transport's problem, not the core's.
   */
  format(
    receipt: ResolvedReceipt,
    draftId: string,
    todayIso: string,
    /** Position in the queue, when more than one receipt is waiting. */
    position?: { index: number; total: number },
    /** What the business currently owes, so an outgoing payment can name it. */
    openPayables: OpenPayable[] = [],
  ): OutgoingMessage {
    const { fields, direction } = receipt;

    if (receipt.duplicateOf) {
      return {
        text:
          `⚠️ Esa referencia ya está registrada.\n\n` +
          `Ref ${fields.reference} · ${formatAmount(Number(receipt.duplicateOf.amount))} · ` +
          `${receipt.duplicateOf.accountName}\n` +
          `Registrada el ${receipt.duplicateOf.movementDate.toISOString().slice(0, 10)}.\n\n` +
          `No registré nada nuevo.`,
      };
    }

    const lines: string[] = [];
    if (position && position.total > 1) {
      lines.push(`_Comprobante ${position.index} de ${position.total}_`);
    }
    const bank = fields.bankName ?? 'Banco';
    const amountLine = this.amountLine(receipt);
    const dateLine = `${formatReceiptDate(fields.date, todayIso)} · Ref ${fields.reference ?? '—'}`;

    if (direction.direction === 'in') {
      lines.push(`💰 *ENTRADA* · ${bank}`);
      lines.push(`${fields.counterparty ?? 'Desconocido'} → ${direction.ourAccountName}`);
    } else if (direction.direction === 'out') {
      lines.push(`💸 *SALIDA* · ${bank}`);
      lines.push(`${direction.ourAccountName} → ${fields.counterparty ?? 'Desconocido'}`);
    } else if (direction.direction === 'internal') {
      lines.push(`🔄 *TRASLADO* · ${bank}`);
      lines.push(`${direction.ourAccountName} → ${direction.counterAccountName}`);
    } else {
      lines.push(`❓ *NO RECONOCIDO* · ${bank}`);
      lines.push(
        `Ninguna de las cuentas del comprobante está registrada como tuya:\n` +
          `${fields.originAccount?.raw ?? '—'} → ${fields.destinationAccount?.raw ?? '—'}`,
      );
    }

    lines.push(amountLine);
    lines.push(dateLine);

    for (const warning of receipt.warnings) lines.push(`⚠️ ${warning}`);

    if (receipt.missing.length > 0) {
      lines.push('');
      lines.push(`No pude leer: ${receipt.missing.map(fieldLabel).join(', ')}.`);
      return { text: lines.join('\n') };
    }

    lines.push('');

    if (direction.direction === 'in') {
      lines.push('¿A qué corresponde?');
      return {
        text: lines.join('\n'),
        buttons: [
          { id: buildButtonId(BUTTON.SALE_PAYMENT, draftId), title: '💰 Cobro de venta' },
          { id: buildButtonId(BUTTON.CATEGORY, draftId, 'capital_in'), title: '🏦 Aporte de capital' },
          { id: buildButtonId(BUTTON.CATEGORY, draftId, 'other'), title: '🧾 Otro ingreso' },
          { id: buildButtonId(BUTTON.CANCEL, draftId), title: '✖️ Descartar' },
        ],
      };
    }

    if (direction.direction === 'out') {
      lines.push('¿A qué corresponde?');
      return {
        text: lines.join('\n'),
        buttons: this.outgoingChoices(draftId, receipt, openPayables),
      };
    }

    if (direction.direction === 'internal') {
      lines.push('¿Registro el traslado entre tus cuentas?');
      return {
        text: lines.join('\n'),
        buttons: [
          { id: buildButtonId(BUTTON.CONFIRM, draftId), title: '✅ Registrar' },
          { id: buildButtonId(BUTTON.CANCEL, draftId), title: '✖️ Descartar' },
        ],
      };
    }

    lines.push('Agrega la cuenta en Tesorería y vuelve a enviar el comprobante.');
    return { text: lines.join('\n') };
  }

  /**
   * What an outgoing payment can be, business operations first.
   *
   * Two things earn a place at the top. What you registered minutes ago, because
   * telling the bot about a purchase and then photographing its receipt is one
   * act split over two messages — and the figures often do not match to the
   * bolivar, so recency is the only thing that ties them together. And a payable
   * whose balance equals the receipt exactly, because that is the common case
   * and it cannot double-count. Everything else is a step away.
   *
   * Still capped at three between them: the rest of this list is fixed, and
   * eleven rows is not a longer list, it is a message Meta rejects.
   */
  private outgoingChoices(
    draftId: string,
    receipt: ResolvedReceipt,
    openPayables: OpenPayable[],
  ): ReplyButton[] {
    const amountBs = this.amountInBs(receipt);
    const matches =
      amountBs === null
        ? []
        : openPayables.filter((p) => Math.abs(p.balance - amountBs) <= AMOUNT_MATCH_TOLERANCE);

    const cutoff = Date.now() - JUST_REGISTERED_MS;
    const fresh = openPayables
      .filter((p) => p.createdAt.getTime() >= cutoff)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Fresh first, then the exact-amount ones it did not already cover. More
    // than one of either means they genuinely compete; the choice is the user's,
    // so both are shown rather than one being guessed.
    const leading: OpenPayable[] = [];
    const seen = new Set<string>();
    for (const payable of [...fresh, ...matches]) {
      const key = `${payable.kind}-${payable.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      leading.push(payable);
      if (leading.length === 3) break;
    }

    const buttons: ReplyButton[] = [];
    for (const payable of leading) {
      buttons.push(
        this.payableButton(
          draftId,
          payable,
          payable.createdAt.getTime() >= cutoff ? 'recién registrada' : undefined,
        ),
      );
    }

    for (const kind of ['processing', 'entry'] as const) {
      const rest = openPayables.filter((p) => p.kind === kind && !seen.has(`${p.kind}-${p.id}`));
      if (rest.length === 0) continue;
      // A single leftover goes straight to its own button; several need a list.
      buttons.push(
        rest.length === 1
          ? this.payableButton(draftId, rest[0])
          : {
              id: buildButtonId(BUTTON.PAYABLE_PICK, draftId, kind),
              title: kind === 'processing' ? '🔪 Pagar un beneficio' : '📦 Pagar una compra',
              description: `${rest.length} pendientes · ${formatBs(
                round2(rest.reduce((sum, p) => sum + p.balance, 0)),
              )}`,
            },
      );
    }

    buttons.push({
      id: buildButtonId(BUTTON.CATEGORY_PICK, draftId),
      title: '🧾 Gasto directo',
      description: 'Alimento, servicios, flete, mano de obra…',
    });
    buttons.push({
      id: buildButtonId(BUTTON.CATEGORY, draftId, 'owner_draw'),
      title: '🏠 Retiro del dueño',
      description: 'Dinero que sacas para ti, no es un gasto del negocio',
    });
    buttons.push({ id: buildButtonId(BUTTON.CANCEL, draftId), title: '✖️ Descartar' });

    return buttons;
  }

  /** The list of payables of one kind, after tapping "Pagar un beneficio". */
  payablePicker(draftId: string, kind: 'entry' | 'processing', payables: OpenPayable[]): OutgoingMessage {
    if (payables.length === 0) {
      return {
        text:
          kind === 'processing'
            ? 'No tienes beneficios pendientes de pago.'
            : 'No tienes compras pendientes de pago.',
      };
    }

    return {
      text: `¿Cuál estás pagando?\n\n_El comprobante se aplica al saldo del que elijas._`,
      buttons: [
        ...payables.slice(0, 9).map((payable) => this.payableButton(draftId, payable)),
        { id: buildButtonId(BUTTON.CANCEL, draftId), title: '✖️ Descartar' },
      ],
    };
  }

  /** The plain expense categories, after tapping "Gasto directo". */
  categoryPicker(draftId: string): OutgoingMessage {
    return {
      text: '¿Qué gasto es?\n\n_Esto registra un gasto nuevo, no el pago de algo ya registrado._',
      buttons: [
        ...EXPENSE_CATEGORY_CHOICES.map((category) => ({
          id: buildButtonId(BUTTON.CATEGORY, draftId, category),
          title: TRANSACTION_CATEGORY_LABELS[category] ?? category,
        })),
        { id: buildButtonId(BUTTON.CANCEL, draftId), title: '✖️ Descartar' },
      ],
    };
  }

  private payableButton(draftId: string, payable: OpenPayable, note?: string): ReplyButton {
    const icon = payable.kind === 'processing' ? '🔪' : '📦';
    const parts = [payable.description, formatBs(payable.balance)];
    if (payable.batchCode) parts.push(payable.batchCode);
    if (note) parts.push(note);
    return {
      id: buildButtonId(BUTTON.PAYABLE, draftId, `${payable.kind}-${payable.id}`),
      title: `${icon} ${payable.code ?? payable.description}`,
      description: parts.join(' · '),
    };
  }

  /** The receipt's amount in bolivares, which is what payable balances are in. */
  private amountInBs(receipt: ResolvedReceipt): number | null {
    if (receipt.fields.amount === null) return null;
    if (receipt.fields.currency !== 'USD') return receipt.fields.amount;
    if (!receipt.exchangeRate) return null;
    return round2(receipt.fields.amount * receipt.exchangeRate);
  }

  private amountLine(receipt: ResolvedReceipt): string {
    const { fields, exchangeRate, exchangeRateStale } = receipt;
    if (fields.amount === null) return 'Monto: no legible';

    const isUsd = fields.currency === 'USD';
    const primary = isUsd ? formatUsd(fields.amount) : formatBs(fields.amount);

    if (!exchangeRate || exchangeRate <= 0) return `*${primary}*`;

    const converted = isUsd
      ? formatBs(round2(fields.amount * exchangeRate))
      : formatUsd(round2(fields.amount / exchangeRate));
    const rateNote = `BCV ${formatAmount(exchangeRate)}${exchangeRateStale ? ', desactualizada' : ''}`;

    return `*${primary}*  ≈ ${converted}  (${rateNote})`;
  }
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
