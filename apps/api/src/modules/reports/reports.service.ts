import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import {
  BREED_STANDARDS,
  CAPITAL_CATEGORIES,
  calculateCostPerChicken,
  calculateFCR,
  calculateMortalityRate,
  daysBetween,
  isoDate,
  round2,
  startOfToday,
} from '@cryotech/shared-types';

const NOT_CAPITAL = { notIn: [...CAPITAL_CATEGORIES] };

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  /**
   * FCR Trend: cumulative FCR over time using FeedConsumption (confirmed/adjusted).
   */
  async getFcrTrend(companyId: string, batchId?: string) {
    const whereClause: Record<string, unknown> = { companyId };
    if (batchId) {
      whereClause.id = batchId;
    } else {
      whereClause.status = { in: ['breeding', 'for_sale'] };
    }

    const batches = await this.prisma.batch.findMany({
      where: whereClause,
      include: {
        dailyLogs: {
          orderBy: { logDate: 'asc' },
          select: { logDate: true, averageWeightG: true },
        },
        feedConsumptions: {
          where: { status: { in: ['confirmed', 'adjusted'] } },
          orderBy: { consumptionDate: 'asc' },
          select: { consumptionDate: true, quantityKg: true },
        },
      },
    });

    const result: Array<{ batchId: string; breed: string; data: Array<{ date: string; fcr: number }> }> = [];

    for (const batch of batches) {
      const dataPoints: Array<{ date: string; fcr: number }> = [];

      // Calculate FCR at each weight measurement point
      let cumulativeFeedKg = 0;
      let feedIndex = 0;

      for (const log of batch.dailyLogs) {
        // Accumulate feed up to this log date
        while (
          feedIndex < batch.feedConsumptions.length &&
          batch.feedConsumptions[feedIndex].consumptionDate <= log.logDate
        ) {
          cumulativeFeedKg += Number(batch.feedConsumptions[feedIndex].quantityKg);
          feedIndex++;
        }

        const avgWeightKg = Number(log.averageWeightG ?? 0) / 1000;

        if (avgWeightKg > 0 && cumulativeFeedKg > 0) {
          const cumulativeFeedPerBird = cumulativeFeedKg / batch.initialQuantity;
          const fcr = calculateFCR(cumulativeFeedPerBird, avgWeightKg);
          if (fcr !== null) {
            dataPoints.push({ date: isoDate(log.logDate), fcr });
          }
        }
      }

      result.push({ batchId: batch.id, breed: batch.breed, data: dataPoints });
    }

    return result;
  }

  async getMortalityByBatch(companyId: string) {
    const batches = await this.prisma.batch.findMany({
      where: { companyId },
      select: {
        id: true,
        breed: true,
        initialQuantity: true,
        currentQuantity: true,
        status: true,
        startDate: true,
        // Mortality comes from here, not from `initial - current`: selling also
        // lowers the live count, so that subtraction counted sold birds as dead.
        dailyLogs: { select: { mortality: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    return batches.map((batch) => {
      const totalMortality = batch.dailyLogs.reduce((sum, log) => sum + log.mortality, 0);
      const rate = calculateMortalityRate(totalMortality, batch.initialQuantity);
      return {
        batchId: batch.id,
        batchName: `${batch.breed} - ${isoDate(batch.startDate)}`,
        mortality: totalMortality,
        rate,
        status: batch.status,
      };
    });
  }

  async getRevenueExpense(companyId: string, months = 12) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        companyId,
        transactionDate: { gte: startDate },
        category: NOT_CAPITAL,
      },
      select: {
        type: true,
        amount: true,
        transactionDate: true,
      },
      orderBy: { transactionDate: 'asc' },
    });

    const monthlyData: Record<string, { income: number; expense: number }> = {};

    for (const tx of transactions) {
      const monthKey = `${tx.transactionDate.getFullYear()}-${String(tx.transactionDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expense: 0 };
      }
      if (tx.type === 'income') {
        monthlyData[monthKey].income += Number(tx.amount);
      } else {
        monthlyData[monthKey].expense += Number(tx.amount);
      }
    }

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        income: Math.round(data.income * 100) / 100,
        expense: Math.round(data.expense * 100) / 100,
      }));
  }

  async getGrowthCurve(companyId: string, batchId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
      include: {
        dailyLogs: {
          orderBy: { logDate: 'asc' },
          select: { logDate: true, averageWeightG: true },
        },
      },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    const startDate = new Date(batch.startDate);
    const breedStandards = BREED_STANDARDS[batch.breed] ?? {};

    const dataPoints: Array<{ day: number; actualWeight: number; standardWeight: number | null }> = [];

    for (const log of batch.dailyLogs) {
      const diffMs = new Date(log.logDate).getTime() - startDate.getTime();
      const day = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const weekNumber = Math.ceil(day / 7) || 1;
      const standardWeight = breedStandards[weekNumber] ?? null;

      dataPoints.push({
        day,
        actualWeight: Number(log.averageWeightG ?? 0),
        standardWeight,
      });
    }

    return {
      batchId: batch.id,
      breed: batch.breed,
      startDate: batch.startDate.toISOString().split('T')[0],
      data: dataPoints,
    };
  }

  async getBatchProfitability(companyId: string) {
    const batches = await this.prisma.batch.findMany({
      where: { companyId },
      select: {
        id: true,
        code: true,
        breed: true,
        startDate: true,
        status: true,
        initialQuantity: true,
        currentQuantity: true,
      },
      orderBy: { startDate: 'desc' },
    });

    // Get current exchange rate (fetches from API if needed)
    const currentRate = await this.exchangeRatesService.getCurrentRate(companyId);
    const exchangeRate = currentRate.effectiveRate || 1;

    const result = [];

    for (const batch of batches) {
      // Total expenses by category (all in Bs)
      const expenses = await this.prisma.transaction.groupBy({
        by: ['category'],
        where: { companyId, batchId: batch.id, type: 'expense', category: NOT_CAPITAL },
        _sum: { amount: true },
      });

      const totalExpenses = expenses.reduce((s, e) => s + Number(e._sum.amount ?? 0), 0);
      const expenseBreakdown = expenses.map((e) => ({
        category: e.category,
        amount: Math.round(Number(e._sum.amount ?? 0) * 100) / 100,
      }));

      // Mortality from daily logs
      const mortalityAgg = await this.prisma.dailyLog.aggregate({
        where: { batchId: batch.id },
        _sum: { mortality: true },
      });
      const mortality = mortalityAgg._sum.mortality ?? 0;

      // Processing data (beneficio)
      const processings = await this.prisma.processing.findMany({
        where: { batchId: batch.id, companyId },
        select: { quantity: true, totalCost: true },
      });
      const processedCount = processings.reduce((s, p) => s + p.quantity, 0);

      // Sales data split by type
      const sales = await this.prisma.sale.findMany({
        where: { batchId: batch.id, companyId },
        select: { quantity: true, weightKg: true, totalAmount: true, totalAmountBs: true, exchangeRate: true, saleType: true, pricePerKg: true },
      });

      const soldLive = sales.filter((s) => s.saleType === 'live');
      const soldDead = sales.filter((s) => s.saleType === 'dead');
      const soldLiveCount = soldLive.reduce((s, sl) => s + sl.quantity, 0);
      const soldDeadCount = soldDead.reduce((s, sl) => s + sl.quantity, 0);
      const soldCount = soldLiveCount + soldDeadCount;

      // Revenue in USD and convert to Bs
      const totalRevenueUsd = sales.reduce((s, sl) => s + Number(sl.totalAmount), 0);
      const totalRevenueBs = sales.reduce((s, sl) => {
        if (sl.totalAmountBs) return s + Number(sl.totalAmountBs);
        const rate = sl.exchangeRate ? Number(sl.exchangeRate) : exchangeRate;
        return s + Number(sl.totalAmount) * rate;
      }, 0);

      const totalSoldWeightKg = sales.reduce((s, sl) => s + Number(sl.weightKg ?? 0), 0);
      const avgPricePerKg = totalSoldWeightKg > 0
        ? Math.round((totalRevenueUsd / totalSoldWeightKg) * 100) / 100
        : 0;
      const avgWeightKg = soldCount > 0
        ? Math.round((totalSoldWeightKg / soldCount) * 100) / 100
        : 0;
      const avgRevenuePerChickenUsd = soldCount > 0
        ? Math.round((totalRevenueUsd / soldCount) * 100) / 100
        : 0;
      const avgRevenuePerChickenBs = soldCount > 0
        ? Math.round((totalRevenueBs / soldCount) * 100) / 100
        : 0;

      // Alive in corral = initial - dead - sold - processed
      const inCorral = batch.initialQuantity - mortality - soldCount - processedCount;
      const costPerChicken = calculateCostPerChicken(totalExpenses, inCorral, batch.currentQuantity);

      const mortalityPct = calculateMortalityRate(mortality, batch.initialQuantity);

      // Profit per chicken in Bs
      const profitPerChickenBs = avgRevenuePerChickenBs > 0
        ? round2(avgRevenuePerChickenBs - costPerChicken)
        : 0;
      const marginPct = avgRevenuePerChickenBs > 0
        ? Math.round((profitPerChickenBs / avgRevenuePerChickenBs) * 10000) / 100
        : 0;

      // Projection in Bs
      const projectedRevenueBs = avgRevenuePerChickenBs > 0
        ? Math.round(inCorral * avgRevenuePerChickenBs * 100) / 100
        : 0;
      const projectedProfitBs = Math.round((projectedRevenueBs + totalRevenueBs - totalExpenses) * 100) / 100;

      result.push({
        batchId: batch.id,
        code: batch.code,
        breed: batch.breed,
        startDate: batch.startDate.toISOString().split('T')[0],
        status: batch.status,
        initialQuantity: batch.initialQuantity,
        currentQuantity: batch.currentQuantity,
        inCorral,
        processedCount,
        soldLiveCount,
        soldDeadCount,
        soldCount,
        mortality,
        mortalityPct,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        costPerChicken,
        expenseBreakdown,
        totalRevenueUsd: Math.round(totalRevenueUsd * 100) / 100,
        totalRevenueBs: Math.round(totalRevenueBs * 100) / 100,
        avgPricePerKg,
        avgWeightKg,
        avgRevenuePerChickenUsd,
        avgRevenuePerChickenBs,
        profitPerChickenBs,
        marginPct,
        projectedRevenueBs,
        projectedProfitBs,
        exchangeRate,
      });
    }

    return result;
  }

  async getTopBatches(companyId: string) {
    const batches = await this.prisma.batch.findMany({
      where: { companyId },
      include: {
        dailyLogs: {
          select: { averageWeightG: true, mortality: true },
          orderBy: { logDate: 'desc' },
          take: 1,
        },
        feedConsumptions: {
          where: { status: { in: ['confirmed', 'adjusted'] } },
          select: { quantityKg: true },
        },
        transactions: {
          where: { type: 'income', category: NOT_CAPITAL },
          select: { amount: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    // Separate query: the include above only takes the last log, for the weight.
    const mortalityPerBatch = await this.prisma.dailyLog.groupBy({
      by: ['batchId'],
      where: { companyId },
      _sum: { mortality: true },
    });
    const deaths = new Map(mortalityPerBatch.map((row) => [row.batchId, row._sum.mortality ?? 0]));

    return batches.map((batch) => {
      const totalFeedKg = batch.feedConsumptions.reduce(
        (sum: number, c) => sum + Number(c.quantityKg), 0,
      );
      const lastLog = batch.dailyLogs[0];
      const lastWeight = Number(lastLog?.averageWeightG ?? 0);
      const totalRevenue = batch.transactions.reduce(
        (sum: number, t) => sum + Number(t.amount), 0,
      );
      const totalMortality = deaths.get(batch.id) ?? 0;
      const mortalityRate = calculateMortalityRate(totalMortality, batch.initialQuantity);

      const avgWeightKg = lastWeight / 1000;
      const feedPerBird = batch.initialQuantity > 0 ? totalFeedKg / batch.initialQuantity : 0;
      const fcr = calculateFCR(feedPerBird, avgWeightKg);

      return {
        id: batch.id,
        breed: batch.breed,
        startDate: isoDate(batch.startDate),
        initialQty: batch.initialQuantity,
        currentQty: batch.currentQuantity,
        mortalityRate,
        totalRevenue: round2(totalRevenue),
        lastWeight,
        fcr,
        status: batch.status,
      };
    });
  }

  // --- Cobranza -----------------------------------------------------------
  //
  // Until now the only thing the system could say about debt was one aggregate
  // number buried in the cash flow. These three answer the questions you
  // actually have with a client in front of you: who owes, how much, how many
  // kilos of that is unpaid, and what is overdue.

  /**
   * Debt broken down by client.
   *
   * `unpaidKg` is prorated: a sale that is half paid counts half its kilos.
   * Reporting the full weight of a partially paid sale would overstate what is
   * still owed, which is the number you read out loud when collecting.
   */
  async getReceivablesByClient(companyId: string) {
    const [sales, rate] = await Promise.all([
      this.prisma.sale.findMany({
        where: { companyId, paymentStatus: { in: ['pending', 'partial'] } },
        include: { client: { select: { id: true, name: true, phone: true } } },
        orderBy: { saleDate: 'asc' },
      }),
      this.exchangeRatesService.getCurrentRate(companyId),
    ]);

    const exchangeRate = rate.unavailable ? 0 : rate.effectiveRate;
    const today = startOfToday();

    const byClient = new Map<
      string,
      {
        clientId: string | null;
        clientName: string;
        phone: string | null;
        owedUsd: number;
        unpaidKg: number;
        salesCount: number;
        overdueCount: number;
        oldestSaleDate: Date;
      }
    >();

    for (const sale of sales) {
      const total = Number(sale.totalAmount);
      const paid = Number(sale.paidAmount);
      const balance = total - paid;
      if (balance <= 0) continue;

      // Sales without a client still have to show up — otherwise the totals
      // here would not add up to the receivables figure on the dashboard.
      const key = sale.clientId ?? '__sin_cliente__';
      const entry = byClient.get(key) ?? {
        clientId: sale.clientId,
        clientName: sale.client?.name ?? 'Sin cliente',
        phone: sale.client?.phone ?? null,
        owedUsd: 0,
        unpaidKg: 0,
        salesCount: 0,
        overdueCount: 0,
        oldestSaleDate: sale.saleDate,
      };

      const unpaidFraction = total > 0 ? balance / total : 1;
      entry.owedUsd += balance;
      entry.unpaidKg += Number(sale.weightKg ?? 0) * unpaidFraction;
      entry.salesCount += 1;
      if (sale.dueDate && sale.dueDate < today) entry.overdueCount += 1;
      if (sale.saleDate < entry.oldestSaleDate) entry.oldestSaleDate = sale.saleDate;

      byClient.set(key, entry);
    }

    const clients = [...byClient.values()]
      .map((entry) => ({
        clientId: entry.clientId,
        clientName: entry.clientName,
        phone: entry.phone,
        owedUsd: round2(entry.owedUsd),
        owedBs: exchangeRate ? round2(entry.owedUsd * exchangeRate) : null,
        unpaidKg: round2(entry.unpaidKg),
        salesCount: entry.salesCount,
        overdueCount: entry.overdueCount,
        oldestSaleDate: isoDate(entry.oldestSaleDate),
        daysSinceOldest: daysBetween(entry.oldestSaleDate, today),
      }))
      .sort((a, b) => b.owedUsd - a.owedUsd);

    const owedUsd = round2(clients.reduce((sum, c) => sum + c.owedUsd, 0));

    return {
      clients,
      totals: {
        owedUsd,
        owedBs: exchangeRate ? round2(owedUsd * exchangeRate) : null,
        unpaidKg: round2(clients.reduce((sum, c) => sum + c.unpaidKg, 0)),
        clientsCount: clients.length,
      },
      exchangeRate: exchangeRate || null,
    };
  }

  /** Every sale and payment for one client, with the running balance. */
  async getClientStatement(companyId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true, name: true, phone: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const [sales, rate] = await Promise.all([
      this.prisma.sale.findMany({
        where: { companyId, clientId },
        include: { payments: { orderBy: { paymentDate: 'asc' } } },
        orderBy: { saleDate: 'desc' },
      }),
      this.exchangeRatesService.getCurrentRate(companyId),
    ]);

    const exchangeRate = rate.unavailable ? 0 : rate.effectiveRate;
    const today = startOfToday();

    const detailed = sales.map((sale) => {
      const total = Number(sale.totalAmount);
      const paid = Number(sale.paidAmount);
      return {
        saleId: sale.id,
        code: sale.code,
        saleDate: isoDate(sale.saleDate),
        saleType: sale.saleType,
        quantity: sale.quantity,
        weightKg: sale.weightKg ? Number(sale.weightKg) : null,
        pricePerKg: sale.pricePerKg ? Number(sale.pricePerKg) : null,
        totalAmount: round2(total),
        paidAmount: round2(paid),
        balance: round2(total - paid),
        paymentStatus: sale.paymentStatus,
        dueDate: sale.dueDate ? isoDate(sale.dueDate) : null,
        isOverdue: Boolean(sale.dueDate && sale.dueDate < today && total - paid > 0),
        payments: sale.payments.map((payment) => ({
          date: isoDate(payment.paymentDate),
          amountUsd: round2(Number(payment.amount)),
          amountBs: payment.amountBs ? round2(Number(payment.amountBs)) : null,
          reference: null as string | null,
        })),
      };
    });

    const sold = round2(detailed.reduce((sum, s) => sum + s.totalAmount, 0));
    const paid = round2(detailed.reduce((sum, s) => sum + s.paidAmount, 0));
    const balance = round2(sold - paid);
    const unpaidKg = round2(
      detailed.reduce((sum, s) => {
        if (s.balance <= 0 || !s.weightKg || s.totalAmount <= 0) return sum;
        return sum + s.weightKg * (s.balance / s.totalAmount);
      }, 0),
    );

    return {
      client,
      sales: detailed,
      totals: {
        sold,
        paid,
        balance,
        balanceBs: exchangeRate ? round2(balance * exchangeRate) : null,
        unpaidKg,
        openSales: detailed.filter((s) => s.balance > 0).length,
      },
      exchangeRate: exchangeRate || null,
    };
  }

  /**
   * Sales past their due date with a balance. `sales.due_date` has existed all
   * along and nothing ever read it.
   */
  async getOverdueSales(companyId: string) {
    const today = startOfToday();

    const sales = await this.prisma.sale.findMany({
      where: {
        companyId,
        paymentStatus: { in: ['pending', 'partial'] },
        dueDate: { lt: today },
      },
      include: { client: { select: { id: true, name: true, phone: true } } },
      orderBy: { dueDate: 'asc' },
    });

    return sales
      .map((sale) => {
        const balance = round2(Number(sale.totalAmount) - Number(sale.paidAmount));
        return {
          saleId: sale.id,
          code: sale.code,
          clientId: sale.clientId,
          clientName: sale.client?.name ?? 'Sin cliente',
          phone: sale.client?.phone ?? null,
          saleDate: isoDate(sale.saleDate),
          dueDate: sale.dueDate ? isoDate(sale.dueDate) : null,
          daysOverdue: sale.dueDate ? daysBetween(sale.dueDate, today) : 0,
          totalAmount: round2(Number(sale.totalAmount)),
          balance,
          weightKg: sale.weightKg ? Number(sale.weightKg) : null,
        };
      })
      .filter((sale) => sale.balance > 0);
  }
}
