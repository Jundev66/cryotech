import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
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
  Sale,
  SaleType,
  PaymentStatus,
  TransactionType,
  TransactionCategory,
} from '@prisma/client';

/** One payment against a sale, as every caller describes it. */
export interface SalePaymentWrite {
  /** Dollars, like the sale's own total. */
  amount: number;
  amountBs?: number;
  exchangeRate?: number;
  paymentDate?: string;
  accountId?: string;
  reference?: string;
  notes?: string;
}

/**
 * Half a cent. Payments arrive rounded to cents while balances come from
 * subtracting two decimals, so an exact comparison rejected paying off a sale
 * in full over a stray 0.0000001.
 */
const CENT_TOLERANCE = 0.005;

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

      if (input.paymentStatus === 'paid') {
        const currentRate = (await this.exchangeRates.getCurrentRate(companyId)).effectiveRate || null;
        await this.writePayment(
          tx,
          companyId,
          sale,
          {
            amount: Number(input.totalAmount),
            amountBs: input.totalAmountBs,
            exchangeRate: input.exchangeRate,
            paymentDate: input.saleDate,
          },
          currentRate,
        );
        sale.paymentStatus = 'paid';
        sale.paidAmount = input.totalAmount as unknown as Prisma.Decimal;
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

  async registerPayment(companyId: string, saleId: string, input: SalePaymentWrite) {
    const [payment] = await this.registerPayments(companyId, [{ ...input, saleId }]);
    return payment;
  }

  async registerPaymentByClientOrSale(
    companyId: string,
    input: {
      saleId?: string;
      clientId?: string;
      amount: number;
      amountBs?: number;
      exchangeRate?: number;
      paymentDate?: string;
      notes?: string;
      accountId?: string;
      reference?: string;
    },
  ) {
    if (input.saleId) {
      return this.registerPayment(companyId, input.saleId, input);
    }
    if (!input.clientId) {
      throw new BadRequestException('Debe indicar una venta o un cliente para el cobro');
    }

    const pendingSales = await this.prisma.sale.findMany({
      where: {
        companyId,
        clientId: input.clientId,
        paymentStatus: { in: ['pending', 'partial'] },
      },
      orderBy: { saleDate: 'asc' },
    });

    if (pendingSales.length === 0) {
      throw new BadRequestException('El cliente no tiene ventas pendientes de cobro');
    }

    let remainingAmount = input.amount;
    const paymentsToApply: Array<SalePaymentWrite & { saleId: string }> = [];

    for (const sale of pendingSales) {
      if (remainingAmount <= 0) break;
      const owed = Math.max(0, Number(sale.totalAmount) - Number(sale.paidAmount));
      if (owed <= 0) continue;
      const toApply = Number(Math.min(remainingAmount, owed).toFixed(2));
      const splitAmountBs = input.amountBs && input.amount > 0
        ? Math.round(((input.amountBs * toApply) / input.amount) * 100) / 100
        : undefined;
      paymentsToApply.push({
        saleId: sale.id,
        amount: toApply,
        amountBs: splitAmountBs,
        exchangeRate: input.exchangeRate,
        paymentDate: input.paymentDate,
        notes: input.notes,
        accountId: input.accountId,
        reference: input.reference,
      });
      remainingAmount = Number((remainingAmount - toApply).toFixed(2));
    }

    return this.registerPayments(companyId, paymentsToApply);
  }

  /**
   * Several payments, all or nothing.
   *
   * One amount spread over a client's sales is a single act. Written one sale
   * at a time, a failure halfway would leave the first sale paid and the next
   * still owing, with the money already counted in the account.
   */
  async registerPayments(companyId: string, payments: Array<SalePaymentWrite & { saleId: string }>) {
    if (payments.length === 0) return [];

    const saleIds = [...new Set(payments.map((payment) => payment.saleId))];
    if (saleIds.length !== payments.length) {
      throw new BadRequestException('Una venta aparece dos veces en el mismo cobro');
    }

    const sales = await this.prisma.sale.findMany({ where: { id: { in: saleIds }, companyId } });
    const byId = new Map(sales.map((sale) => [sale.id, sale]));

    for (const payment of payments) {
      const sale = byId.get(payment.saleId);
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.paymentStatus === 'paid') {
        throw new BadRequestException(`La venta ${sale.code ?? ''} ya está completamente pagada`.replace('  ', ' '));
      }

      const remaining = Number(sale.totalAmount) - Number(sale.paidAmount);
      // Half a cent of slack: amounts arrive rounded to cents, balances are
      // derived from two decimals that do not always subtract cleanly.
      if (payment.amount > remaining + CENT_TOLERANCE) {
        throw new BadRequestException(`El monto (${payment.amount}) excede el saldo pendiente (${remaining})`);
      }
    }

    // `transactions.amount` is read as bolivares everywhere in this system, so
    // a payment booked without a rate would store dollars in a bolivar column
    // and throw the cash flow off by the exchange rate. Resolve it here rather
    // than trusting every caller to pass one — once, however many sales.
    let currentRate: number | null = null;
    if (payments.some((payment) => !payment.exchangeRate && !payment.amountBs)) {
      const current = await this.exchangeRates.getCurrentRate(companyId);
      if (current.unavailable || !current.effectiveRate) {
        throw new BadRequestException(
          'No hay tasa de cambio disponible: registre la tasa o indique el monto en bolívares.',
        );
      }
      currentRate = current.effectiveRate;
    }

    return this.prisma.$transaction(async (tx) => {
      const written = [];
      for (const payment of payments) {
        written.push(await this.writePayment(tx, companyId, byId.get(payment.saleId)!, payment, currentRate));
      }
      return written;
    });
  }

  /** One payment inside an open transaction. Validation already happened. */
  private async writePayment(
    tx: Prisma.TransactionClient,
    companyId: string,
    sale: Sale,
    input: SalePaymentWrite,
    currentRate: number | null,
  ) {
    const saleId = sale.id;
    const newPaidAmount = Number(sale.paidAmount) + input.amount;
    const newStatus = newPaidAmount >= Number(sale.totalAmount) - CENT_TOLERANCE ? 'paid' : 'partial';

    const txCategory: TransactionCategory = sale.saleType === 'live' ? 'sale_live' : 'sale_dead';

    const exchangeRate = input.exchangeRate ?? (input.amountBs ? null : currentRate);

    const amountBs =
      input.amountBs ??
      (exchangeRate ? Math.round(input.amount * exchangeRate * 100) / 100 : input.amount);
    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

    // Conditional on the balance read before the transaction opened. A payment
    // landing in between — the web and the bot at once — makes this match no
    // row, and the whole payment rolls back instead of one overwriting the
    // other's paidAmount. Postgres re-checks the condition once the competing
    // update commits, so the race cannot slip past it.
    const { count } = await tx.sale.updateMany({
      where: { id: saleId, companyId, paidAmount: sale.paidAmount },
      data: { paidAmount: newPaidAmount, paymentStatus: newStatus },
    });
    if (count === 0) {
      throw new ConflictException('La venta cambió mientras se registraba el cobro. Intenta de nuevo.');
    }

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
          // A sale payment always carries its dollar figure, so a dollar
          // account gets exactly that and a bolivar account the bolivares.
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

  /** Undoes one payment of a sale. */
  async voidPayment(companyId: string, saleId: string, paymentId: string) {
    const payment = await this.prisma.salePayment.findFirst({
      where: { id: paymentId, saleId, companyId },
      select: { id: true },
    });
    if (!payment) throw new NotFoundException('Cobro no encontrado');
    return this.voidPayments(companyId, [payment.id]);
  }

  /**
   * Undoes payments as if they had never been registered.
   *
   * Each payment goes with the income transaction and the treasury movement it
   * booked, and every sale touched has its balance worked out again from the
   * payments it has left. All of it in one transaction — the payments were
   * registered together, and half an undo would leave a balance that matches
   * nothing.
   */
  async voidPayments(companyId: string, paymentIds: string[]) {
    const unique = [...new Set(paymentIds)];
    const payments = await this.prisma.salePayment.findMany({
      where: { id: { in: unique }, companyId },
      include: { sale: { select: { id: true, totalAmount: true } } },
    });
    if (payments.length !== unique.length) throw new NotFoundException('Cobro no encontrado');

    const sales = new Map(payments.map((payment) => [payment.sale.id, payment.sale]));

    await this.prisma.$transaction(async (tx) => {
      for (const payment of payments) {
        await this.movements.reverseBySource(tx, companyId, 'sale_payment', payment.id);
        await tx.transaction.deleteMany({
          where: { companyId, sourceType: 'sale_payment', sourceId: payment.id },
        });
        await tx.salePayment.delete({ where: { id: payment.id } });
      }

      for (const sale of sales.values()) {
        const { _sum } = await tx.salePayment.aggregate({
          where: { saleId: sale.id },
          _sum: { amount: true },
        });
        const paid = Math.round(Number(_sum.amount ?? 0) * 100) / 100;
        const total = Number(sale.totalAmount);
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            paidAmount: paid,
            paymentStatus: paid <= CENT_TOLERANCE ? 'pending' : paid >= total - CENT_TOLERANCE ? 'paid' : 'partial',
          },
        });
      }
    });

    return { success: true, voided: payments.length };
  }

  async update(companyId: string, saleId: string, input: Partial<SaleInput & { dueDate?: string }>) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, companyId },
      include: { payments: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    // Once money has been applied, what was sold, to whom and for how much is
    // settled. Changing the type would not move the stock back, and the income
    // already booked would stay under the old category, client or amount. Notes
    // and the due date are still free.
    if (sale.payments.length > 0) {
      const locked: Array<keyof typeof input & keyof typeof sale> = [
        'totalAmount', 'saleType', 'clientId', 'weightKg', 'pricePerKg', 'pricePerUnit',
        'pricePerKgBs', 'totalAmountBs', 'exchangeRate',
      ];
      const changed = locked.filter((key) => {
        const next = input[key];
        if (next === undefined) return false;
        const current = sale[key];
        return typeof next === 'number' ? Number(current ?? Number.NaN) !== next : (current ?? null) !== (next ?? null);
      });
      if (changed.length > 0) {
        throw new BadRequestException(
          'Esta venta ya tiene cobros: solo se pueden cambiar las notas y el vencimiento. Anula sus cobros primero.',
        );
      }
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
