import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BotDraft } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { MovementsService } from '../../treasury/movements.service';
import { PayablesService } from '../../payables/payables.service';
import { SalePaymentAllocator, describeAllocation } from './sale-payment.allocator';
import { formatBs, formatUsd } from '../formatting/number.format';
import type { OutgoingMessage } from '../types/assistant.types';
import type { PayableKind } from '../../payables/payables.types';

interface DraftEntities {
  amount: number | null;
  currency: 'VES' | 'USD' | null;
  date: string | null;
  reference: string | null;
  counterparty: string | null;
  concept: string | null;
}

interface DraftResolved {
  direction: 'in' | 'out' | 'internal' | 'unknown';
  ourAccountId: string | null;
  counterAccountId: string | null;
  exchangeRate: number | null;
  clientId: string | null;
  clientName: string | null;
  clientIsNew: boolean;
  awaiting?: string[];
}

export type ExecuteAction =
  /** `clientId` when the user picked who paid; otherwise the one the reader matched. */
  | { kind: 'sale_payment'; clientId?: string }
  | { kind: 'payable_payment'; payableKind: PayableKind; payableId: string }
  | { kind: 'category'; category: string }
  | { kind: 'transfer' };

/**
 * Turns a confirmed draft into ledger entries.
 *
 * Everything it writes goes through the existing services, so a receipt-driven
 * payment lands in exactly the same shape as one entered on the web — same
 * validation, same treasury linkage, same sequence codes.
 */
@Injectable()
export class ReceiptExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
    private readonly movements: MovementsService,
    private readonly payables: PayablesService,
    private readonly allocator: SalePaymentAllocator,
  ) {}

  async execute(draft: BotDraft, action: ExecuteAction): Promise<OutgoingMessage> {
    const entities = draft.entities as unknown as DraftEntities;
    const resolved = draft.resolved as unknown as DraftResolved;

    if (resolved.awaiting && resolved.awaiting.length > 0) {
      throw new BadRequestException('Al comprobante todavía le faltan datos por completar');
    }
    if (entities.amount === null) throw new BadRequestException('El borrador no tiene monto');
    if (!resolved.ourAccountId) throw new BadRequestException('El borrador no tiene cuenta');

    switch (action.kind) {
      case 'sale_payment':
        return this.applySalePayment(draft, entities, resolved, action.clientId);
      case 'payable_payment':
        return this.applyPayablePayment(draft, entities, resolved, action);
      case 'category':
        return this.recordTransaction(draft, entities, resolved, action.category);
      case 'transfer':
        return this.recordTransfer(draft, entities, resolved);
    }
  }

  /**
   * Applies the money to the client's open sales, oldest first.
   *
   * It used to settle only the oldest sale and report the rest as "apply it by
   * hand" — which nobody could do from the phone. It is now spread the same way
   * a cash collection is, in one transaction, and only what exceeds everything
   * owed is left over.
   */
  private async applySalePayment(
    draft: BotDraft,
    entities: DraftEntities,
    resolved: DraftResolved,
    chosenClientId?: string,
  ): Promise<OutgoingMessage> {
    const client = await this.payer(draft.companyId, resolved, chosenClientId);

    const result = await this.allocator.apply(draft.companyId, {
      clientId: client.id,
      amount: entities.amount!,
      currency: entities.currency === 'USD' ? 'USD' : 'VES',
      exchangeRate: resolved.exchangeRate,
      accountId: resolved.ourAccountId!,
      paymentDate: entities.date ?? undefined,
      reference: entities.reference ?? undefined,
      notes: `Comprobante ${entities.reference ?? ''}`.trim(),
    });

    return { text: describeAllocation(result, client.name).join('\n') };
  }

  /**
   * Who paid: the client the user tapped, or the one the reader was sure of.
   *
   * Never creates one. A client made from how a bank spelled a name was a
   * duplicate waiting to happen — and a brand-new client has no sale to pay
   * anyway, so the payment could not have landed.
   */
  private async payer(
    companyId: string,
    resolved: DraftResolved,
    chosenClientId?: string,
  ): Promise<{ id: string; name: string }> {
    const id = chosenClientId ?? resolved.clientId;
    if (!id) throw new BadRequestException('Elige de qué cliente es este cobro');

    const client = await this.prisma.client.findFirst({
      where: { id, companyId },
      select: { id: true, name: true },
    });
    if (!client) throw new NotFoundException('Ese cliente ya no existe');
    return client;
  }

  /**
   * Settles a purchase or a processing job with the money on the receipt.
   *
   * No expense is booked: the operation recognised it when it happened. This is
   * the whole point of offering the payable instead of an expense category —
   * the Carmen payment booked as "servicios" duplicated a cost BEN-2600005 had
   * already recorded.
   */
  private async applyPayablePayment(
    draft: BotDraft,
    entities: DraftEntities,
    resolved: DraftResolved,
    action: Extract<ExecuteAction, { kind: 'payable_payment' }>,
  ): Promise<OutgoingMessage> {
    const payable = await this.payables.findOne(
      draft.companyId,
      action.payableKind,
      action.payableId,
    );

    const isUsd = entities.currency === 'USD';
    const rate = resolved.exchangeRate;
    if (isUsd && !rate) {
      throw new BadRequestException('No hay tasa de cambio para convertir el pago a bolívares');
    }

    // Never pay more than is owed: the excess is reported so it can be applied
    // where it actually belongs instead of silently inflating this payable.
    const amountBs = isUsd ? round2(entities.amount! * (rate as number)) : entities.amount!;
    const applied = Math.min(amountBs, payable.balance);
    const leftover = round2(amountBs - applied);

    await this.payables.registerPayment(draft.companyId, {
      kind: action.payableKind,
      payableId: action.payableId,
      amount: applied,
      currency: 'VES',
      exchangeRate: rate ?? undefined,
      paymentDate: entities.date ?? undefined,
      accountId: resolved.ourAccountId!,
      reference: entities.reference ?? undefined,
      notes: `Comprobante ${entities.reference ?? ''}`.trim(),
    });

    const noun = action.payableKind === 'processing' ? 'beneficio' : 'compra';
    const lines = [
      `✅ Pago registrado en ${payable.code ?? `la ${noun}`}`,
      `${payable.description} · ${formatBs(applied)}`,
    ];
    if (payable.supplierName) lines.push(payable.supplierName);

    const stillOwed = round2(payable.balance - applied);
    if (stillOwed > 0) lines.push(`Queda por pagar ${formatBs(stillOwed)}.`);
    else lines.push(`Ese ${noun} queda pagado por completo.`);

    if (leftover > 0) {
      lines.push(
        `⚠️ Sobran ${formatBs(leftover)} que no apliqué: exceden el saldo. Regístralos aparte.`,
      );
    }

    return { text: lines.join('\n') };
  }

  private async recordTransaction(
    draft: BotDraft,
    entities: DraftEntities,
    resolved: DraftResolved,
    category: string,
  ): Promise<OutgoingMessage> {
    const isIncome = resolved.direction === 'in';

    const transaction = await this.transactions.create(draft.companyId, {
      type: isIncome ? 'income' : 'expense',
      category,
      amount: entities.amount!,
      currency: entities.currency ?? 'VES',
      exchangeRate: resolved.exchangeRate ?? undefined,
      description: [entities.counterparty, entities.concept].filter(Boolean).join(' · ') || undefined,
      transactionDate: entities.date ?? undefined,
      accountId: resolved.ourAccountId!,
      reference: entities.reference ?? undefined,
    });

    const shown =
      entities.currency === 'USD' ? formatUsd(entities.amount!) : formatBs(entities.amount!);

    return {
      text:
        `✅ ${isIncome ? 'Ingreso' : 'Gasto'} registrado ${transaction.code}\n` +
        `${shown}${entities.counterparty ? ` · ${entities.counterparty}` : ''}`,
    };
  }

  private async recordTransfer(
    draft: BotDraft,
    entities: DraftEntities,
    resolved: DraftResolved,
  ): Promise<OutgoingMessage> {
    if (!resolved.counterAccountId) {
      throw new BadRequestException('El traslado no tiene cuenta de destino');
    }

    await this.movements.recordTransfer(draft.companyId, {
      fromAccountId: resolved.ourAccountId!,
      toAccountId: resolved.counterAccountId,
      amount: entities.amount!,
      movementDate: entities.date ?? undefined,
      reference: entities.reference ?? undefined,
    });

    return { text: `✅ Traslado registrado por ${formatBs(entities.amount!)}` };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
