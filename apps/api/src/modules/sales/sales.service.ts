import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { ProcessedStockService } from '../../common/services/processed-stock.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { MovementsService } from '../treasury/movements.service';
import { textSearchWhere, enumSearchValues } from '../../common/search/search.util';
import {
  SALE_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  type BulkSaleInput,
  type BulkSaleItemInput,
  type SaleInput,
} from '@cryotech/shared-types';
import type {
  Prisma,
  SaleType,
  PaymentStatus,
  TransactionType,
  TransactionCategory,
} from '@prisma/client';

/** The relations every sale is returned with, single or bulk. */
const SALE_INCLUDE = {
  batch: { select: { id: true, breed: true, status: true } },
  client: { select: { id: true, name: true } },
  payments: true,
} as const;

function sumQuantity(items: BulkSaleItemInput[], saleType: 'live' | 'dead'): number {
  return items
    .filter((item) => item.saleType === saleType)
    .reduce((total, item) => total + item.quantity, 0);
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly processedStock: ProcessedStockService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly movements: MovementsService,
  ) {}

  async findAll(
    companyId: string,
    filters?: { batchId?: string; paymentStatus?: PaymentStatus; search?: string },
  ) {
    const text = textSearchWhere(filters?.search, ['code', 'notes', 'client.name', 'batch.breed']);
    // Enum columns reject `contains`, so what the user reads on screen — "Vivo",
    // "Pagado" — is translated back into the values behind those labels.
    const types = enumSearchValues(filters?.search, SALE_TYPE_LABELS);
    const statuses = enumSearchValues(filters?.search, PAYMENT_STATUS_LABELS);

    return this.prisma.sale.findMany({
      where: {
        companyId,
        ...(filters?.batchId && { batchId: filters.batchId }),
        ...(filters?.paymentStatus && { paymentStatus: filters.paymentStatus }),
        ...(text && {
          OR: [
            text,
            ...(types.length ? [{ saleType: { in: types as SaleType[] } }] : []),
            ...(statuses.length ? [{ paymentStatus: { in: statuses as PaymentStatus[] } }] : []),
          ],
        }),
      },
      include: {
        batch: { select: { id: true, breed: true, status: true } },
        client: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
      orderBy: { saleDate: 'desc' },
    });
  }

  async findOne(companyId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, companyId },
      include: {
        batch: { select: { id: true, breed: true, status: true } },
        client: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  async create(companyId: string, input: SaleInput & { dueDate?: string }) {
    const batch = await this.loadSellableBatch(companyId, input.batchId);

    // Live birds come out of the batch; processed ones come out of processed
    // stock, where they already landed when they were slaughtered.
    const fromProcessedStock = input.saleType === 'dead';

    if (fromProcessedStock) {
      const available = await this.processedStock.available(companyId);
      if (input.quantity > available) {
        throw new BadRequestException(
          `Cantidad de venta (${input.quantity}) excede los pollos beneficiados en inventario (${available})`,
        );
      }
    } else if (input.quantity > batch.currentQuantity) {
      throw new BadRequestException(
        `Cantidad de venta (${input.quantity}) excede la cantidad actual del lote (${batch.currentQuantity})`,
      );
    }

    if (input.clientId) await this.assertClients(companyId, [input.clientId]);

    return this.prisma.$transaction(async (tx) => {
      // Inside the transaction so a failed sale does not burn a code and leave
      // a permanent gap in the VEN- sequence.
      const code = await this.sequenceService.next(companyId, 'sale', tx);

      const sale = await tx.sale.create({
        data: this.buildSaleData(companyId, code, input.batchId, input),
        include: SALE_INCLUDE,
      });

      if (fromProcessedStock) {
        await this.processedStock.decrement(tx, companyId, input.quantity);
      } else {
        await this.decrementBatchWithin(tx, input.batchId, input.quantity);
      }

      return sale;
    });
  }

  /**
   * Registers several sales off one batch in a single transaction.
   *
   * This is not a loop over `create`, and the difference is the whole point:
   * `create` checks the quantity against a `currentQuantity` it read *before*
   * opening its transaction, so three calls of thirty birds each pass their own
   * check individually and oversell a batch of fifty between them. Here the
   * quantities are added up first, and the decrement itself is conditional, so
   * even a race that slips past the arithmetic cannot drive the batch negative
   * — nothing in the schema would stop it if it did.
   *
   * All or nothing. Partial success would either burn codes on the rows that
   * failed — the gap the comment in `create` exists to prevent — or leave the
   * farmer working out which three of four landed and why the batch count no
   * longer matches the delivery.
   */
  async createMany(companyId: string, input: BulkSaleInput) {
    const batch = await this.loadSellableBatch(companyId, input.batchId);
    await this.assertClients(
      companyId,
      input.items.map((item) => item.clientId),
    );

    const liveQuantity = sumQuantity(input.items, 'live');
    const deadQuantity = sumQuantity(input.items, 'dead');

    // Checked up front purely for the message: the user needs to read "las 3
    // ventas suman 120 aves y el lote tiene 90", not a generic rejection. The
    // check that actually guarantees it is the conditional update below.
    if (liveQuantity > batch.currentQuantity) {
      throw new BadRequestException(
        `Las ${input.items.length} ventas suman ${liveQuantity} aves y el lote solo tiene ${batch.currentQuantity}`,
      );
    }
    if (deadQuantity > 0) {
      const available = await this.processedStock.available(companyId);
      if (deadQuantity > available) {
        throw new BadRequestException(
          `Las ventas suman ${deadQuantity} pollos beneficiados y en inventario hay ${available}`,
        );
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        const codes = await this.sequenceService.nextRange(
          companyId,
          'sale',
          input.items.length,
          tx,
        );

        await tx.sale.createMany({
          data: input.items.map((item, index) =>
            this.buildSaleData(companyId, codes[index], input.batchId, {
              ...item,
              saleDate: input.saleDate,
            }),
          ),
        });

        if (liveQuantity > 0) {
          await this.decrementBatchWithin(tx, input.batchId, liveQuantity);
        }
        if (deadQuantity > 0) {
          await this.processedStock.decrement(tx, companyId, deadQuantity);
        }

        // `createMany` returns a count, not rows, and takes no `include`. Codes
        // are unique per company, so reading them back is deterministic.
        return tx.sale.findMany({
          where: { companyId, code: { in: codes } },
          include: SALE_INCLUDE,
          orderBy: { code: 'asc' },
        });
      },
      // The default five seconds is sized for a single write; fifty rows plus
      // the reread is not that.
      { timeout: 20_000, maxWait: 5_000 },
    );
  }

  /** The batch exists, belongs to this company, and still takes sales. */
  private async loadSellableBatch(companyId: string, batchId: string) {
    const batch = await this.prisma.batch.findFirst({ where: { id: batchId, companyId } });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    if (batch.status === 'planned' || batch.status === 'finished') {
      throw new BadRequestException(
        'Solo se pueden registrar ventas en lotes en crianza o en venta',
      );
    }
    return batch;
  }

  /** One query for N clients — and the tenancy check, which is the real job. */
  private async assertClients(companyId: string, clientIds: string[]) {
    const unique = [...new Set(clientIds)];
    if (unique.length === 0) return;

    const found = await this.prisma.client.findMany({
      where: { companyId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) throw new NotFoundException('Cliente no encontrado');
  }

  /**
   * Takes birds off the batch without letting it go negative.
   *
   * `UPDATE … WHERE current_quantity >= X` is atomic: either it fits and the
   * row moves, or nothing happens. There is no CHECK constraint on the column,
   * so a plain decrement would happily write a negative count and nothing
   * downstream would notice until someone read a report.
   */
  private async decrementBatchWithin(
    tx: Prisma.TransactionClient,
    batchId: string,
    quantity: number,
  ) {
    const { count } = await tx.batch.updateMany({
      where: { id: batchId, currentQuantity: { gte: quantity } },
      data: { currentQuantity: { decrement: quantity } },
    });
    if (count > 0) return;

    const current = await tx.batch.findUnique({
      where: { id: batchId },
      select: { currentQuantity: true },
    });
    throw new BadRequestException(
      `Cantidad de venta (${quantity}) excede la cantidad actual del lote (${current?.currentQuantity ?? 0})`,
    );
  }

  private buildSaleData(
    companyId: string,
    code: string,
    batchId: string,
    input: Omit<SaleInput, 'batchId'> & { dueDate?: string; saleDate?: string },
  ) {
    return {
      companyId,
      code,
      batchId,
      clientId: input.clientId ?? null,
      saleType: input.saleType as SaleType,
      quantity: input.quantity,
      weightKg: input.weightKg ?? null,
      pricePerKg: input.pricePerKg ?? null,
      pricePerUnit: input.pricePerUnit ?? null,
      totalAmount: input.totalAmount,
      pricePerKgBs: input.pricePerKgBs ?? null,
      totalAmountBs: input.totalAmountBs ?? null,
      exchangeRate: input.exchangeRate ?? null,
      paymentStatus: 'pending' as const,
      paidAmount: 0,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      // Honour a back-dated sale; falls back to the column default (today).
      ...(input.saleDate ? { saleDate: new Date(input.saleDate) } : {}),
      notes: input.notes ?? null,
    };
  }

  async registerPayment(companyId: string, saleId: string, input: {
    amount: number;
    amountBs?: number;
    exchangeRate?: number;
    paymentDate?: string;
    accountId?: string;
    reference?: string;
    notes?: string;
  }) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, companyId },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.paymentStatus === 'paid') {
      throw new BadRequestException('Esta venta ya está completamente pagada');
    }

    const remaining = Number(sale.totalAmount) - Number(sale.paidAmount);
    if (input.amount > remaining) {
      throw new BadRequestException(`El monto (${input.amount}) excede el saldo pendiente (${remaining})`);
    }

    const newPaidAmount = Number(sale.paidAmount) + input.amount;
    const newStatus = newPaidAmount >= Number(sale.totalAmount) ? 'paid' : 'partial';

    const txCategory: TransactionCategory = sale.saleType === 'live' ? 'sale_live' : 'sale_dead';

    // `transactions.amount` is read as bolivares everywhere in this system, so
    // a payment booked without a rate would store dollars in a bolivar column
    // and throw the cash flow off by the exchange rate. Resolve it here rather
    // than trusting every caller to pass one.
    let exchangeRate = input.exchangeRate ?? null;
    if (!exchangeRate && !input.amountBs) {
      const current = await this.exchangeRates.getCurrentRate(companyId);
      if (current.unavailable || !current.effectiveRate) {
        throw new BadRequestException(
          'No hay tasa de cambio disponible: registre la tasa o indique el monto en bolívares.',
        );
      }
      exchangeRate = current.effectiveRate;
    }

    const amountBs =
      input.amountBs ??
      (exchangeRate ? Math.round(input.amount * exchangeRate * 100) / 100 : input.amount);
    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.salePayment.create({
        data: {
          saleId,
          companyId,
          amount: input.amount,
          amountBs,
          exchangeRate,
          accountId: input.accountId ?? null,
          paymentDate,
          notes: input.notes ?? null,
        },
      });

      await tx.sale.update({
        where: { id: saleId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newStatus,
        },
      });

      // Auto-create income transaction — amount always in Bs (primary currency)
      const txCode = await this.sequenceService.next(companyId, 'transaction', tx);
      await tx.transaction.create({
        data: {
          companyId,
          code: txCode,
          batchId: sale.batchId,
          type: 'income' as TransactionType,
          category: txCategory,
          amount: amountBs,
          exchangeRate,
          accountId: input.accountId ?? null,
          description: `Cobro de venta: ${sale.quantity} pollos (${sale.saleType === 'live' ? 'vivos' : 'muertos'})`,
          sourceType: 'sale_payment',
          sourceId: payment.id,
          transactionDate: paymentDate,
        },
      });

      // Treasury side: where the money actually landed. Same transaction as the
      // payment, so the balance can never drift from the ledger.
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
            direction: 'in',
            amount: account.currency === 'USD' ? input.amount : amountBs,
            movementDate: paymentDate,
            reference: input.reference ?? null,
            counterparty: null,
            concept: `Cobro de venta ${sale.code ?? ''}`.trim(),
            sourceType: 'sale_payment',
            sourceId: payment.id,
          },
          tx,
        );
      }

      return payment;
    });
  }

  async getPayments(companyId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, companyId },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    return this.prisma.salePayment.findMany({
      where: { saleId },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async update(companyId: string, saleId: string, input: Partial<SaleInput & { dueDate?: string }>) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, companyId },
      include: { payments: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    // Don't allow changing totalAmount if payments exist
    if (input.totalAmount !== undefined && sale.payments.length > 0) {
      throw new BadRequestException('No se puede modificar el monto total con pagos registrados');
    }

    // `create` validates the client; this path did not, so a sale could be
    // reassigned to another company's client and wreck their statement with a
    // debt that is not theirs.
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: input.clientId, companyId },
      });
      if (!client) throw new NotFoundException('Cliente no encontrado');
    }

    return this.prisma.sale.update({
      where: { id: saleId },
      data: {
        ...(input.clientId !== undefined && { clientId: input.clientId }),
        ...(input.saleType !== undefined && { saleType: input.saleType as SaleType }),
        ...(input.weightKg !== undefined && { weightKg: input.weightKg }),
        ...(input.pricePerKg !== undefined && { pricePerKg: input.pricePerKg }),
        ...(input.pricePerUnit !== undefined && { pricePerUnit: input.pricePerUnit }),
        ...(input.totalAmount !== undefined && { totalAmount: input.totalAmount }),
        ...(input.pricePerKgBs !== undefined && { pricePerKgBs: input.pricePerKgBs }),
        ...(input.totalAmountBs !== undefined && { totalAmountBs: input.totalAmountBs }),
        ...(input.exchangeRate !== undefined && { exchangeRate: input.exchangeRate }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
      },
      include: {
        batch: { select: { id: true, breed: true, status: true } },
        client: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
  }

  async remove(companyId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, companyId },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    if (sale.paymentStatus !== 'pending') {
      throw new BadRequestException('No se puede eliminar una venta con pagos registrados');
    }

    await this.prisma.$transaction(async (tx) => {
      // Put the birds back where the sale took them from
      if (sale.saleType === 'dead') {
        await this.processedStock.increment(tx, companyId, sale.quantity);
      } else {
        await tx.batch.update({
          where: { id: sale.batchId },
          data: { currentQuantity: { increment: sale.quantity } },
        });
      }

      await tx.sale.delete({ where: { id: saleId } });
    });

    return { success: true };
  }
}
