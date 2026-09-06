import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { MovementsService } from '../treasury/movements.service';
import type { OpenPayable, PayableKind, RegisterPayablePaymentInput } from './payables.types';

/**
 * Everything the business owes, in one place.
 *
 * A purchase and a processing job are the same thing financially: the operation
 * recognised the expense when it happened, and paying it only moves cash. Two
 * services doing that separately is how the same expense got booked twice —
 * Bs 2.450 to Carmen landed as a fresh "servicios" expense even though
 * BEN-2600005 had already recognised it.
 *
 * So paying here **never** creates a Transaction. If nothing recognised the
 * expense, the fix is to register the operation, not to book the payment as one.
 */
@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly movements: MovementsService,
  ) {}

  /**
   * Purchases and processings with a balance owing, newest first.
   *
   * Self-processed batches are left out: nobody is waiting to be paid for work
   * you did yourself.
   */
  async listOpen(companyId: string, filters?: { kind?: PayableKind }): Promise<OpenPayable[]> {
    const wantEntries = !filters?.kind || filters.kind === 'entry';
    const wantProcessings = !filters?.kind || filters.kind === 'processing';

    const [entries, processings] = await Promise.all([
      wantEntries
        ? this.prisma.productEntry.findMany({
            where: { companyId, paymentStatus: { not: 'paid' } },
            include: {
              product: { select: { name: true } },
              batch: { select: { id: true, code: true } },
            },
            orderBy: { entryDate: 'desc' },
          })
        : [],
      wantProcessings
        ? this.prisma.processing.findMany({
            where: { companyId, paymentStatus: { not: 'paid' }, isSelfProcessed: false },
            include: { batch: { select: { id: true, code: true } } },
            orderBy: { processingDate: 'desc' },
          })
        : [],
    ]);

    const payables: OpenPayable[] = [];

    for (const entry of entries) {
      const total = round2(Number(entry.totalCost ?? 0) + Number(entry.deliveryCost ?? 0));
      const paid = Number(entry.paidAmount);
      if (total <= 0) continue; // Nothing was ever owed on it.
      payables.push({
        kind: 'entry',
        id: entry.id,
        code: entry.code,
        description: `${entry.product.name} x ${Number(entry.quantity)}`,
        supplierName: entry.supplierName,
        total,
        paid,
        balance: round2(total - paid),
        date: entry.entryDate,
        createdAt: entry.createdAt,
        batchId: entry.batchId,
        batchCode: entry.batch?.code ?? null,
      });
    }

    for (const processing of processings) {
      const total = processingTotalBs(processing);
      const paid = Number(processing.paidAmount);
      if (total <= 0) continue;
      payables.push({
        kind: 'processing',
        id: processing.id,
        code: processing.code,
        description: `Beneficio de ${processing.quantity} aves`,
        supplierName: processing.supplierName,
        total,
        paid,
        balance: round2(total - paid),
        date: processing.processingDate,
        createdAt: processing.createdAt,
        batchId: processing.batchId,
        batchCode: processing.batch?.code ?? null,
      });
    }

    return payables.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /** One payable by kind and id, whether or not it still has a balance. */
  async findOne(companyId: string, kind: PayableKind, payableId: string): Promise<OpenPayable> {
    const payable = await this.load(this.prisma, companyId, kind, payableId);
    return payable;
  }

  /**
   * Records money paid against a purchase or a processing job.
   *
   * Moves cash and updates the operation's payment state. Nothing else — see the
   * class comment for why booking an expense here would double-count.
   */
  async registerPayment(companyId: string, input: RegisterPayablePaymentInput) {
    if (!(input.amount > 0)) {
      throw new BadRequestException('El monto debe ser mayor que cero');
    }

    const payable = await this.load(this.prisma, companyId, input.kind, input.payableId);
    if (payable.balance <= 0.01) {
      throw new BadRequestException(
        `${labelFor(payable)} ya está completamente pagado`,
      );
    }

    let exchangeRate = input.exchangeRate ?? null;
    if (input.currency === 'USD' && !exchangeRate) {
      const current = await this.exchangeRates.getCurrentRate(companyId);
      if (current.unavailable || !current.effectiveRate) {
        throw new BadRequestException(
          'No hay tasa de cambio disponible: indique la tasa o registre el monto en bolívares.',
        );
      }
      exchangeRate = current.effectiveRate;
    }

    // Payables are denominated in bolivares, so that is the unit the paid amount
    // accumulates in regardless of which currency actually left the account.
    const amountBs =
      input.currency === 'USD'
        ? round2(input.amount * (exchangeRate as number))
        : round2(input.amount);

    if (amountBs > payable.balance + 0.01) {
      throw new BadRequestException(
        `El monto (Bs ${amountBs}) excede el saldo pendiente (Bs ${payable.balance})`,
      );
    }

    const newPaid = round2(payable.paid + amountBs);
    const newStatus = newPaid >= payable.total - 0.01 ? 'paid' : 'partial';
    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payablePayment.create({
        data: {
          companyId,
          entryId: input.kind === 'entry' ? payable.id : null,
          processingId: input.kind === 'processing' ? payable.id : null,
          amount: amountBs,
          amountUsd: input.currency === 'USD' ? input.amount : null,
          exchangeRate,
          accountId: input.accountId ?? null,
          reference: input.reference ?? null,
          paymentDate,
          notes: input.notes ?? null,
        },
      });

      const state = { paidAmount: newPaid, paymentStatus: newStatus as 'paid' | 'partial' };
      if (input.kind === 'entry') {
        await tx.productEntry.update({ where: { id: payable.id }, data: state });
      } else {
        await tx.processing.update({ where: { id: payable.id }, data: state });
      }

      if (input.accountId) {
        const account = await tx.account.findFirst({
          where: { id: input.accountId, companyId },
          select: { currency: true },
        });
        if (!account) throw new NotFoundException('Cuenta no encontrada');

        await this.movements.record(
          companyId,
          {
            accountId: input.accountId,
            direction: 'out',
            // The account moves in its own currency; the payable is settled in
            // bolivares. Only one of the two figures is right per account.
            amount: account.currency === 'USD' ? input.amount : amountBs,
            movementDate: paymentDate,
            reference: input.reference ?? null,
            counterparty: payable.supplierName,
            concept: conceptFor(payable),
            sourceType: 'payable_payment',
            sourceId: payment.id,
          },
          tx,
        );
      }

      return payment;
    });
  }

  async getPayments(companyId: string, kind: PayableKind, payableId: string) {
    await this.load(this.prisma, companyId, kind, payableId);
    return this.prisma.payablePayment.findMany({
      where: kind === 'entry' ? { entryId: payableId } : { processingId: payableId },
      orderBy: { paymentDate: 'desc' },
    });
  }

  /**
   * Payables whose outstanding balance matches an amount, within a tolerance.
   *
   * This is what lets a receipt for Bs 2.450 offer "pagar BEN-2600005" as the
   * first option instead of a list of accounting categories. Returns every match
   * — when two payables have the same balance, the choice is the user's.
   */
  async findByAmount(
    companyId: string,
    amountBs: number,
    tolerance = 0.5,
  ): Promise<OpenPayable[]> {
    const open = await this.listOpen(companyId);
    return open.filter((payable) => Math.abs(payable.balance - amountBs) <= tolerance);
  }

  private async load(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    kind: PayableKind,
    payableId: string,
  ): Promise<OpenPayable> {
    if (kind === 'entry') {
      const entry = await client.productEntry.findFirst({
        where: { id: payableId, companyId },
        include: {
          product: { select: { name: true } },
          batch: { select: { id: true, code: true } },
        },
      });
      if (!entry) throw new NotFoundException('Entrada no encontrada');

      const total = round2(Number(entry.totalCost ?? 0) + Number(entry.deliveryCost ?? 0));
      if (total <= 0) {
        throw new BadRequestException(
          'Esta entrada no tiene costo registrado, no hay nada que pagar',
        );
      }
      const paid = Number(entry.paidAmount);
      return {
        kind: 'entry',
        id: entry.id,
        code: entry.code,
        description: `${entry.product.name} x ${Number(entry.quantity)}`,
        supplierName: entry.supplierName,
        total,
        paid,
        balance: round2(total - paid),
        date: entry.entryDate,
        createdAt: entry.createdAt,
        batchId: entry.batchId,
        batchCode: entry.batch?.code ?? null,
      };
    }

    const processing = await client.processing.findFirst({
      where: { id: payableId, companyId },
      include: { batch: { select: { id: true, code: true } } },
    });
    if (!processing) throw new NotFoundException('Beneficio no encontrado');
    if (processing.isSelfProcessed) {
      throw new BadRequestException('Este beneficio fue propio, no hay a quién pagarle');
    }

    const total = processingTotalBs(processing);
    if (total <= 0) {
      throw new BadRequestException(
        'Este beneficio no tiene costo en bolívares registrado, no hay nada que pagar',
      );
    }
    const paid = Number(processing.paidAmount);
    return {
      kind: 'processing',
      id: processing.id,
      code: processing.code,
      description: `Beneficio de ${processing.quantity} aves`,
      supplierName: processing.supplierName,
      total,
      paid,
      balance: round2(total - paid),
      date: processing.processingDate,
      createdAt: processing.createdAt,
      batchId: processing.batchId,
      batchCode: processing.batch?.code ?? null,
    };
  }
}

/**
 * The bolivar cost of a processing job.
 *
 * ⚠️ `totalCost` on a processing is in **dollars** — unlike a purchase, where it
 * is bolivares. Reading it here would put the balance off by the exchange rate,
 * currently a factor of ~757. `totalCostBs` is the figure that matters; the
 * multiplication is only a fallback for rows saved before it existed.
 */
function processingTotalBs(processing: {
  totalCost: Prisma.Decimal;
  totalCostBs: Prisma.Decimal | null;
  exchangeRate: Prisma.Decimal | null;
}): number {
  if (processing.totalCostBs !== null) return round2(Number(processing.totalCostBs));
  if (processing.exchangeRate !== null) {
    return round2(Number(processing.totalCost) * Number(processing.exchangeRate));
  }
  return 0;
}

function labelFor(payable: OpenPayable): string {
  const noun = payable.kind === 'entry' ? 'Esta compra' : 'Este beneficio';
  return payable.code ? `${noun} (${payable.code})` : noun;
}

function conceptFor(payable: OpenPayable): string {
  const verb = payable.kind === 'entry' ? 'Pago de compra' : 'Pago de beneficio';
  return `${verb} ${payable.code ?? ''} · ${payable.description}`.replace('  ', ' ').trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
