import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { TransactionCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { textSearchWhere, enumSearchValues } from '../../common/search/search.util';
import { TRANSACTION_CATEGORY_LABELS } from '@cryotech/shared-types';
import { SequenceService } from '../../common/services/sequence.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { MovementsService } from '../treasury/movements.service';
import { amountForAccount } from '../treasury/account-amount';
import type { TransactionInput } from '@cryotech/shared-types';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly sequenceService: SequenceService,
    private readonly movements: MovementsService,
  ) {}

  /**
   * Records a manual income or expense.
   *
   * `transactions.amount` is bolivares everywhere in this system, so a figure
   * given in dollars is converted here rather than stored as-is — that mistake
   * is invisible in the row and shows up later as a cash flow off by the
   * exchange rate.
   *
   * When `accountId` is given, the cash side is booked in the same transaction,
   * so a balance can never drift from the movement that caused it.
   */
  async create(
    companyId: string,
    input: TransactionInput & { accountId?: string; reference?: string; currency?: 'VES' | 'USD' },
  ) {
    // The account is validated below, inside the transaction; the batch was
    // validated nowhere, so an expense of this company could be charged to
    // another company's batch and show up in its cost per kilo.
    if (input.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: input.batchId, companyId },
      });
      if (!batch) throw new NotFoundException('Lote no encontrado');
    }

    const isUsd = input.currency === 'USD';

    let exchangeRate = input.exchangeRate ?? null;
    if (!exchangeRate && (isUsd || !input.amountBs)) {
      const current = await this.exchangeRates.getCurrentRate(companyId);
      if (!current.unavailable && current.effectiveRate) exchangeRate = current.effectiveRate;
    }

    if (isUsd && !exchangeRate) {
      throw new BadRequestException(
        'No hay tasa de cambio disponible: indique la tasa o registre el monto en bolívares.',
      );
    }

    const amountBs = isUsd
      ? Math.round(input.amount * (exchangeRate as number) * 100) / 100
      : input.amount;
    const transactionDate = input.transactionDate ? new Date(input.transactionDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const code = await this.sequenceService.next(companyId, 'transaction', tx);

      const transaction = await tx.transaction.create({
        data: {
          companyId,
          code,
          batchId: input.batchId ?? null,
          type: input.type,
          category: input.category as TransactionCategory,
          amount: amountBs,
          exchangeRate,
          accountId: input.accountId ?? null,
          description: input.description ?? null,
          sourceType: 'manual',
          transactionDate,
        },
      });

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
            direction: input.type === 'income' ? 'in' : 'out',
            amount: amountForAccount({
              accountCurrency: account.currency,
              amountBs,
              amountUsd: isUsd ? input.amount : null,
              rate: exchangeRate,
            }),
            movementDate: transactionDate,
            reference: input.reference ?? null,
            concept: input.description ?? null,
            sourceType: 'transaction',
            sourceId: transaction.id,
          },
          tx,
        );
      }

      return transaction;
    });
  }

  /**
   * Undoes an income or expense that was recorded by hand — from the web or
   * the bot — along with the money it moved.
   *
   * Only `manual` ones: a purchase, a slaughter or a sale payment booked its
   * transaction as a consequence, and removing the transaction alone would
   * leave that operation paid or received with nothing on the books.
   */
  async voidManual(companyId: string, transactionId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, companyId },
    });
    if (!transaction) throw new NotFoundException('Transaccion no encontrada');
    if (transaction.sourceType !== 'manual') {
      throw new BadRequestException(
        'Solo se anulan ingresos o gastos registrados a mano. Este viene de otra operación: corrígelo desde ella.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.movements.reverseBySource(tx, companyId, 'transaction', transaction.id);
      await tx.transaction.delete({ where: { id: transaction.id } });
    });

    return { success: true, code: transaction.code };
  }

  async findAll(
    companyId: string,
    filters?: {
      type?: string;
      category?: string;
      startDate?: string;
      endDate?: string;
      batchId?: string;
      sourceType?: string;
      search?: string;
    },
  ) {
    const where: Record<string, unknown> = { companyId };

    const text = textSearchWhere(filters?.search, ['code', 'description', 'batch.breed']);
    if (text) {
      // `category` is an enum and rejects `contains`, so "vacuna" — which is
      // what the row actually says on screen — is matched against the labels
      // and turned back into the values behind them.
      const categories = enumSearchValues(filters?.search, TRANSACTION_CATEGORY_LABELS);
      where.OR = [
        text,
        ...(categories.length ? [{ category: { in: categories as TransactionCategory[] } }] : []),
      ];
    }

    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.batchId) {
      where.batchId = filters.batchId;
    }
    if (filters?.sourceType) {
      where.sourceType = filters.sourceType;
    }
    if (filters?.startDate || filters?.endDate) {
      where.transactionDate = {};
      if (filters.startDate) {
        (where.transactionDate as Record<string, unknown>).gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        (where.transactionDate as Record<string, unknown>).lte = new Date(filters.endDate);
      }
    }

    return this.prisma.transaction.findMany({
      where,
      include: { batch: { select: { id: true, breed: true, status: true } } },
      orderBy: { transactionDate: 'desc' },
    });
  }

  async findOne(companyId: string, transactionId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, companyId },
      include: { batch: { select: { id: true, breed: true, status: true } } },
    });
    if (!transaction) throw new NotFoundException('Transaccion no encontrada');
    return transaction;
  }

  async getCashFlow(companyId: string, filters?: { startDate?: string; endDate?: string; batchId?: string }) {
    const where: Record<string, unknown> = { companyId };

    if (filters?.batchId) where.batchId = filters.batchId;
    if (filters?.startDate || filters?.endDate) {
      where.transactionDate = {};
      if (filters.startDate) (where.transactionDate as Record<string, unknown>).gte = new Date(filters.startDate);
      if (filters.endDate) (where.transactionDate as Record<string, unknown>).lte = new Date(filters.endDate);
    }

    const [transactions, pendingSales, rateResult] = await Promise.all([
      this.prisma.transaction.findMany({ where, select: { type: true, category: true, amount: true, exchangeRate: true } }),
      this.prisma.sale.findMany({
        where: { companyId, paymentStatus: { in: ['pending', 'partial'] } },
        select: { totalAmount: true, paidAmount: true },
      }),
      this.exchangeRates.getCurrentRate(companyId),
    ]);

    // What the owner put in or took out moves the cash but is not income or an
    // expense of the business. Counted as such it inflated both cards, while
    // reports, the dashboard and the bot's summaries already left it out.
    const capital = new Set(['capital_in', 'owner_draw']);
    const total = (rows: typeof transactions) => rows.reduce((sum, t) => sum + Number(t.amount), 0);

    const incomeBs = total(transactions.filter((t) => t.type === 'income' && !capital.has(t.category)));
    const expensesBs = total(transactions.filter((t) => t.type === 'expense' && !capital.has(t.category)));
    const capitalInBs = total(transactions.filter((t) => t.category === 'capital_in'));
    const ownerDrawBs = total(transactions.filter((t) => t.category === 'owner_draw'));

    // Cash on hand is still everything that came in minus everything that left.
    const balanceBs = incomeBs - expensesBs + capitalInBs - ownerDrawBs;
    const rate = rateResult.effectiveRate || 1;

    const receivablesUsd = pendingSales.reduce(
      (sum, s) => sum + (Number(s.totalAmount) - Number(s.paidAmount)),
      0,
    );

    const money = (bs: number) => ({
      bs: Math.round(bs * 100) / 100,
      usd: Math.round((bs / rate) * 100) / 100,
    });

    return {
      income: money(incomeBs),
      expenses: money(expensesBs),
      capitalIn: money(capitalInBs),
      ownerDraw: money(ownerDrawBs),
      balance: money(balanceBs),
      receivables: {
        usd: Math.round(receivablesUsd * 100) / 100,
        count: pendingSales.length,
      },
      exchangeRate: rate,
    };
  }
}
