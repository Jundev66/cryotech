import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CAPITAL_CATEGORIES,
  SALE_TYPE_LABELS,
  TRANSACTION_CATEGORY_LABELS,
  formatCurrency,
  formatUsd,
} from '@cryotech/shared-types';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(companyId: string) {
    const [batches, transactions, dailyLogMortality] = await Promise.all([
      this.prisma.batch.findMany({
        where: { companyId },
        select: { initialQuantity: true, currentQuantity: true, status: true },
      }),
      this.prisma.transaction.aggregate({
        where: { companyId, type: 'income', category: { notIn: [...CAPITAL_CATEGORIES] } },
        _sum: { amount: true },
      }),
      this.prisma.dailyLog.aggregate({
        where: { companyId, batch: { status: { in: ['breeding', 'for_sale'] } } },
        _sum: { mortality: true },
      }),
    ]);

    const activeBatches = batches.filter(
      (b) => b.status === 'breeding' || b.status === 'for_sale',
    ).length;

    const totalAlive = batches
      .filter((b) => b.status === 'breeding' || b.status === 'for_sale')
      .reduce((sum, b) => sum + b.currentQuantity, 0);

    const activeInitial = batches
      .filter((b) => b.status === 'breeding' || b.status === 'for_sale')
      .reduce((sum, b) => sum + b.initialQuantity, 0);
    const totalMortality = dailyLogMortality._sum.mortality ?? 0;
    const mortalityPct = activeInitial > 0
      ? Math.round((totalMortality / activeInitial) * 10000) / 100
      : 0;

    const totalRevenue = Number(transactions._sum.amount ?? 0);

    return {
      activeBatches,
      totalAlive,
      mortalityPct,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    };
  }

  async getRecentActivity(companyId: string) {
    const [dailyLogs, sales, transactions] = await Promise.all([
      this.prisma.dailyLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          batch: { select: { id: true, breed: true } },
        },
      }),
      this.prisma.sale.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          saleDate: true,
          quantity: true,
          totalAmount: true,
          saleType: true,
          paymentStatus: true,
          createdAt: true,
          batch: { select: { id: true, breed: true } },
        },
      }),
      this.prisma.transaction.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          category: true,
          amount: true,
          sourceType: true,
          transactionDate: true,
          createdAt: true,
        },
      }),
    ]);

    const activities: Array<{
      id: string;
      type: string;
      description: string;
      date: Date;
      meta?: Record<string, unknown>;
    }> = [];

    for (const log of dailyLogs) {
      activities.push({
        id: log.id,
        type: 'daily_log',
        description: `Registro diario: ${log.batch.breed} - ${log.mortality} muertes`,
        date: log.createdAt,
        meta: { batchId: log.batch.id, breed: log.batch.breed },
      });
    }

    for (const sale of sales) {
      activities.push({
        id: sale.id,
        type: 'sale',
        description: `Venta: ${sale.quantity} ${SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType} · ${formatUsd(Number(sale.totalAmount))}`,
        date: sale.createdAt,
        meta: { batchId: sale.batch.id, breed: sale.batch.breed },
      });
    }

    for (const tx of transactions) {
      activities.push({
        id: tx.id,
        type: 'transaction',
        // Bolivares: that is the currency of `transactions`.
        description: `${tx.type === 'income' ? 'Ingreso' : 'Gasto'}: ${TRANSACTION_CATEGORY_LABELS[tx.category] ?? tx.category} · ${formatCurrency(Number(tx.amount))}`,
        date: tx.createdAt,
      });
    }

    activities.sort((a, b) => b.date.getTime() - a.date.getTime());
    return activities.slice(0, 20);
  }

  async getBatchStatusDistribution(companyId: string) {
    const batches = await this.prisma.batch.groupBy({
      by: ['status'],
      where: { companyId },
      _count: { status: true },
    });

    return batches.map((b) => ({
      status: b.status,
      count: b._count.status,
    }));
  }
}
