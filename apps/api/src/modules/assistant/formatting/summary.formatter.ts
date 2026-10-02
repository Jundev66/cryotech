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

/** How many days back the date question offers, today included. */
const DATE_CHOICES = 7;

/** An account the user can say the money went through. */
export interface AccountChoice {
  id: string;
  name: string;
  currency: string;
}

/** A client a payment can be applied to, with why they are on the list. */
export interface ClientChoice {
  id: string;
  name: string;
  note?: string;
}

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
    /** The company's accounts, for when the receipt's could not be recognised. */
    accounts: AccountChoice[] = [],
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

    // Something the reader could not see is asked before anything is offered:
    // the choices below need the amount, the date and the account to mean anything.
    if (receipt.awaiting && receipt.awaiting.length > 0) {
      return this.askMissing(receipt, draftId, todayIso, position, accounts);
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

    if (receipt.missing.length > 0 && !receipt.awaiting) {
      lines.push('');
      lines.push(`No pude leer: ${receipt.missing.map(fieldLabel).join(', ')}.`);
      return { text: lines.join('\n') };
    }

    lines.push('');

    if (direction.direction === 'in') {
      // Without a sure match the payer is asked for first. Guessing used to
      // create a brand-new client from however the bank spelled the name.
      const confident = receipt.client?.confident ?? true;
      lines.push('¿A qué corresponde?');
      return {
        text: lines.join('\n'),
        buttons: [
          confident
            ? { id: buildButtonId(BUTTON.SALE_PAYMENT, draftId), title: '💰 Cobro de venta' }
            : {
                id: buildButtonId(BUTTON.CLIENT_PICK, draftId),
                title: '💰 Cobro de venta',
                description: 'Te pregunto de qué cliente',
              },
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
   * Asks for the first thing the reader could not see.
   *
   * One question at a time, with what was read shown above it, so the user can
   * see the receipt is the right one before answering. Only the amount and the
   * reference are typed; the date, the direction and the account are tapped.
   */
  private askMissing(
    receipt: ResolvedReceipt,
    draftId: string,
    todayIso: string,
    position: { index: number; total: number } | undefined,
    accounts: AccountChoice[],
  ): OutgoingMessage {
    const { fields, direction } = receipt;
    const field = receipt.awaiting![0];
    const answer = (value: string) => buildButtonId(BUTTON.RECEIPT_FIELD, draftId, value);
    const discard: ReplyButton = { id: buildButtonId(BUTTON.CANCEL, draftId), title: '✖️ Descartar' };

    const lines: string[] = [];
    if (position && position.total > 1) {
      lines.push(`_Comprobante ${position.index} de ${position.total}_`);
    }
    lines.push(`📄 *COMPROBANTE* · ${fields.bankName ?? 'Banco'}`);
    if (direction.ourAccountName) {
      lines.push(`${direction.direction === 'out' ? 'Desde' : 'En'} ${direction.ourAccountName}`);
    }
    if (fields.counterparty) lines.push(fields.counterparty);
    lines.push(fields.amount === null ? 'Monto: ?' : this.amountLine(receipt));
    lines.push(
      `${fields.date ? formatReceiptDate(fields.date, todayIso) : 'Fecha: ?'} · Ref ${fields.reference ?? '?'}`,
    );
    lines.push('');

    switch (field) {
      case 'amount':
        lines.push('No pude leer el *monto*. Escríbelo como sale en la captura.');
        lines.push('_Por ejemplo 1.250,50 o 20$_');
        return { text: lines.join('\n'), buttons: [discard] };

      case 'date': {
        lines.push('No pude leer la *fecha*. ¿De qué día es?');
        const days = Array.from({ length: DATE_CHOICES }, (_, offset) => shiftDays(todayIso, -offset));
        return {
          text: lines.join('\n'),
          buttons: [
            ...days.map((day) => ({ id: answer(`date=${day}`), title: dayTitle(day, todayIso) })),
            discard,
          ],
        };
      }

      case 'reference':
        lines.push('No pude leer la *referencia*. Escríbela; con los últimos 6 dígitos basta.');
        lines.push('_Es lo que evita que la misma captura se registre dos veces._');
        return {
          text: lines.join('\n'),
          buttons: [{ id: answer('reference=none'), title: '⏭️ No tiene referencia' }, discard],
        };

      case 'direction':
        lines.push('No reconocí tus cuentas en la captura. ¿Este dinero entró o salió?');
        return {
          text: lines.join('\n'),
          buttons: [
            { id: answer('direction=in'), title: '💰 Me pagaron', description: 'Entró a una cuenta tuya' },
            { id: answer('direction=out'), title: '💸 Pagué yo', description: 'Salió de una cuenta tuya' },
            discard,
          ],
        };

      case 'account':
        if (accounts.length === 0) {
          lines.push('No tienes cuentas en Tesorería. Agrega una en la web y vuelve a mandar la captura.');
          return { text: lines.join('\n'), buttons: [discard] };
        }
        lines.push(direction.direction === 'out' ? '¿De qué cuenta salió?' : '¿A qué cuenta entró?');
        lines.push(
          '_Si guardas en Tesorería los últimos 4 dígitos o el teléfono de esa cuenta, la próxima vez la reconozco sola._',
        );
        return {
          text: lines.join('\n'),
          buttons: [
            ...accounts.slice(0, 8).map((account) => ({
              id: answer(`account=${account.id}`),
              title: account.name,
              description: account.currency === 'USD' ? 'Dólares' : 'Bolívares',
            })),
            discard,
          ],
        };
    }
  }

  /**
   * Who paid, when the name on the receipt did not settle it.
   *
   * Only clients who owe something are offered: a payment has to land on an
   * open sale, and a client without one would only fail at the last tap.
   */
  clientPicker(draftId: string, clients: ClientChoice[], nameOnReceipt: string | null): OutgoingMessage {
    const discard: ReplyButton = { id: buildButtonId(BUTTON.CANCEL, draftId), title: '✖️ Descartar' };

    if (clients.length === 0) {
      return {
        text:
          'Nadie tiene ventas pendientes, así que no hay a qué aplicar este cobro.\n\n' +
          'Registra primero la venta, o toca otra opción del comprobante.',
        buttons: [discard],
      };
    }

    const lines = ['¿Quién te pagó?'];
    if (nameOnReceipt) lines.push(`_En la captura dice: ${nameOnReceipt}_`);
    lines.push('', '_Se aplica a sus ventas pendientes, de la más vieja a la más nueva._');

    return {
      text: lines.join('\n'),
      buttons: [
        ...clients.slice(0, 9).map((client) => ({
          id: buildButtonId(BUTTON.SALE_PAYMENT, draftId, client.id),
          title: `👤 ${client.name}`,
          description: client.note,
        })),
        discard,
      ],
    };
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

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function dayTitle(iso: string, todayIso: string): string {
  const [, month, day] = iso.split('-');
  if (iso === todayIso) return `Hoy · ${day}/${month}`;
  if (iso === shiftDays(todayIso, -1)) return `Ayer · ${day}/${month}`;
  return `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${day}/${month}`;
}
