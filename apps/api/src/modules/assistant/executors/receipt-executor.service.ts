import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { BotDraft } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SalesService } from '../../sales/sales.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { MovementsService } from '../../treasury/movements.service';
import { PayablesService } from '../../payables/payables.service';
import { SequenceService } from '../../../common/services/sequence.service';
import { ClientResolver } from '../resolvers/client.resolver';
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
}

export type ExecuteAction =
  | { kind: 'sale_payment' }
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
  private readonly logger = new Logger(ReceiptExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly transactions: TransactionsService,
    private readonly movements: MovementsService,
    private readonly payables: PayablesService,
    private readonly clients: ClientResolver,
    private readonly sequenceService: SequenceService,
  ) {}

  async execute(draft: BotDraft, action: ExecuteAction): Promise<OutgoingMessage> {
    const entities = draft.entities as unknown as DraftEntities;
    const resolved = draft.resolved as unknown as DraftResolved;

    if (entities.amount === null) throw new BadRequestException('El borrador no tiene monto');
    if (!resolved.ourAccountId) throw new BadRequestException('El borrador no tiene cuenta');

    switch (action.kind) {
      case 'sale_payment':
        return this.applySalePayment(draft, entities, resolved);
      case 'payable_payment':
        return this.applyPayablePayment(draft, entities, resolved, action);
      case 'category':
        return this.recordTransaction(draft, entities, resolved, action.category);
      case 'transfer':
        return this.recordTransfer(draft, entities, resolved);
    }
  }

  private async applySalePayment(
    draft: BotDraft,
    entities: DraftEntities,
    resolved: DraftResolved,
  ): Promise<OutgoingMessage> {
    const clientId = await this.ensureClient(draft.companyId, entities, resolved);
    if (!clientId) {
      throw new BadRequestException('No pude identificar el cliente de este cobro');
    }

    const pending = await this.clients.pendingSales(draft.companyId, clientId);
    if (pending.length === 0) {
      throw new BadRequestException(
        `${resolved.clientName ?? entities.counterparty} no tiene ventas pendientes de cobro`,
      );
    }

    const rate = resolved.exchangeRate;
    const isUsd = entities.currency === 'USD';
    if (!isUsd && !rate) {
      throw new BadRequestException('No hay tasa de cambio para convertir el cobro a dólares');
    }

    const amountBs = isUsd ? round2(entities.amount! * (rate as number)) : entities.amount!;
    const amountUsd = isUsd ? entities.amount! : round2(entities.amount! / (rate as number));

    // Oldest debt first, capped at what that sale still owes. A payment larger
    // than the oldest sale is reported rather than spread silently across
    // several — guessing the allocation is the kind of thing you find out about
    // a month later.
    const target = pending[0];
    const remaining = round2(Number(target.totalAmount) - Number(target.paidAmount));
    const applied = Math.min(amountUsd, remaining);
    const leftover = round2(amountUsd - applied);

    // The bolivar figure on the receipt is what the bank actually moved, so it
    // is authoritative. Converting it to dollars and back would drift by a
    // bolivar or two and leave the account permanently unable to reconcile
    // against the bank statement. Only prorate when part of the payment could
    // not be applied to this sale.
    const appliedBs = applied === amountUsd ? amountBs : round2(applied * (rate as number));

    await this.sales.registerPayment(draft.companyId, target.id, {
      amount: applied,
      amountBs: appliedBs,
      exchangeRate: rate ?? undefined,
      paymentDate: entities.date ?? undefined,
      accountId: resolved.ourAccountId!,
      reference: entities.reference ?? undefined,
      notes: `Comprobante ${entities.reference ?? ''}`.trim(),
    });

    const lines = [
      `✅ Cobro registrado en ${target.code ?? 'la venta'}`,
      `${resolved.clientName ?? entities.counterparty} · ${formatUsd(applied)} (${formatBs(amountBs)})`,
    ];

    const stillOwed = round2(remaining - applied);
    if (stillOwed > 0) lines.push(`Queda debiendo ${formatUsd(stillOwed)} en esa venta.`);
    if (leftover > 0) {
      lines.push(
        `⚠️ Sobran ${formatUsd(leftover)} que no apliqué: exceden el saldo de esa venta. Aplícalos manualmente a otra.`,
      );
    }

    return { text: lines.join('\n') };
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

  /** Creates the client only now — a discarded receipt leaves no trace. */
  private async ensureClient(
    companyId: string,
    entities: DraftEntities,
    resolved: DraftResolved,
  ): Promise<string | null> {
    if (resolved.clientId) return resolved.clientId;
    if (!entities.counterparty) return null;

    const created = await this.prisma.$transaction(async (tx) => {
      const code = await this.sequenceService.next(companyId, 'client', tx);
      return tx.client.create({
        data: { companyId, code, name: entities.counterparty!.trim() },
      });
    });

    this.logger.log(`Created client ${created.code} "${created.name}" from a receipt`);
    return created.id;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
