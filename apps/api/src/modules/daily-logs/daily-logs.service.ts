import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import type { DailyLogInput } from '@cryotech/shared-types';
import type { TransactionType, TransactionCategory } from '@prisma/client';

@Injectable()
export class DailyLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
  ) {}

  async findAll(companyId: string, batchId?: string) {
    return this.prisma.dailyLog.findMany({
      where: {
        companyId,
        ...(batchId && { batchId }),
      },
      include: {
        batch: true,
        medicineProduct: { select: { id: true, name: true, measurementUnit: true } },
        feedProduct: { select: { id: true, name: true, measurementUnit: true } },
      },
      orderBy: { logDate: 'desc' },
    });
  }

  async findOne(companyId: string, logId: string) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, companyId },
      include: {
        batch: true,
        medicineProduct: { select: { id: true, name: true, measurementUnit: true } },
        feedProduct: { select: { id: true, name: true, measurementUnit: true } },
      },
    });
    if (!log) throw new NotFoundException('Registro diario no encontrado');
    return log;
  }

  async create(companyId: string, input: DailyLogInput) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: input.batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    if (batch.status === 'planned') {
      throw new BadRequestException('No se pueden agregar registros a un lote en planificacion');
    }
    if (batch.status === 'finished') {
      throw new BadRequestException('No se pueden agregar registros a un lote finalizado');
    }

    if (input.mortality > batch.currentQuantity) {
      throw new BadRequestException(
        `La mortalidad (${input.mortality}) no puede exceder la cantidad actual del lote (${batch.currentQuantity})`,
      );
    }

    // Validate medicine product if provided
    if (input.medicineAdministered && input.medicineProductId) {
      const medicineProduct = await this.prisma.product.findFirst({
        where: { id: input.medicineProductId, companyId },
      });
      if (!medicineProduct) throw new NotFoundException('Producto de medicina no encontrado');
    }

    // Validate feed product if provided
    if (input.feedConsumedKg && input.feedProductId) {
      const feedProduct = await this.prisma.product.findFirst({
        where: { id: input.feedProductId, companyId },
      });
      if (!feedProduct) throw new NotFoundException('Producto de alimento no encontrado');
    }

    return this.prisma.$transaction(async (tx) => {
      const log = await tx.dailyLog.create({
        data: {
          batchId: input.batchId,
          companyId,
          logDate: new Date(input.logDate),
          waterConsumedL: input.waterConsumedL ?? null,
          mortality: input.mortality,
          averageWeightG: input.averageWeightG ?? null,
          temperatureC: input.temperatureC ?? null,
          humidityPct: input.humidityPct ?? null,
          notes: input.notes ?? null,
          medicineAdministered: input.medicineAdministered ?? false,
          medicineNotes: input.medicineNotes ?? null,
          medicineProductId: input.medicineProductId ?? null,
          medicineQuantity: input.medicineQuantity ?? null,
          feedConsumedKg: input.feedConsumedKg ?? null,
          feedProductId: input.feedProductId ?? null,
          healthScore: input.healthScore ?? null,
        },
        include: {
          batch: true,
          medicineProduct: { select: { id: true, name: true, measurementUnit: true } },
          feedProduct: { select: { id: true, name: true, measurementUnit: true } },
        },
      });

      // Decrement batch quantity for mortality
      if (input.mortality > 0) {
        await tx.batch.update({
          where: { id: input.batchId },
          data: { currentQuantity: { decrement: input.mortality } },
        });
      }

      // Decrement medicine product stock + create expense transaction
      if (input.medicineAdministered && input.medicineProductId && input.medicineQuantity) {
        const medicineProduct = await tx.product.update({
          where: { id: input.medicineProductId },
          data: { currentStock: { decrement: input.medicineQuantity } },
          include: { category: true },
        });

        // Calculate medicine cost from the latest entry's cost per unit
        const latestEntry = await tx.productEntry.findFirst({
          where: { productId: input.medicineProductId, status: 'received' },
          orderBy: { entryDate: 'desc' },
          select: { costPerUnit: true },
        });
        const costPerUnit = latestEntry?.costPerUnit ? Number(latestEntry.costPerUnit) : 0;
        const medicineCost = costPerUnit * input.medicineQuantity;

        if (medicineCost > 0) {
          const txCode = await this.sequenceService.next(companyId, 'transaction', tx);
          await tx.transaction.create({
            data: {
              companyId,
              code: txCode,
              batchId: input.batchId,
              type: 'expense' as TransactionType,
              category: 'vaccine' as TransactionCategory,
              amount: medicineCost,
              description: `Medicina: ${medicineProduct.name} x ${input.medicineQuantity}`,
              sourceType: 'daily_log',
              sourceId: log.id,
              transactionDate: new Date(input.logDate),
            },
          });
        }
      }

      // Handle feed consumption
      if (input.feedConsumedKg && input.feedProductId) {
        const feedProduct = await tx.product.update({
          where: { id: input.feedProductId },
          data: { currentStock: { decrement: input.feedConsumedKg } },
        });

        await tx.feedConsumption.create({
          data: {
            batchId: input.batchId,
            companyId,
            productId: input.feedProductId,
            consumptionDate: new Date(input.logDate),
            quantityKg: input.feedConsumedKg,
            isAutoCalculated: false,
            isAutoGenerated: false,
            status: 'confirmed',
          },
        });

        // Calculate feed cost from latest entry cost per unit
        const latestFeedEntry = await tx.productEntry.findFirst({
          where: { productId: input.feedProductId, status: 'received' },
          orderBy: { entryDate: 'desc' },
          select: { costPerUnit: true },
        });
        const feedCostPerUnit = latestFeedEntry?.costPerUnit ? Number(latestFeedEntry.costPerUnit) : 0;
        const feedCost = feedCostPerUnit * input.feedConsumedKg;

        if (feedCost > 0) {
          const txCode = await this.sequenceService.next(companyId, 'transaction', tx);
          await tx.transaction.create({
            data: {
              companyId,
              code: txCode,
              batchId: input.batchId,
              type: 'expense' as TransactionType,
              category: 'feed' as TransactionCategory,
              amount: feedCost,
              description: `Consumo alimento: ${feedProduct.name} x ${input.feedConsumedKg} kg`,
              sourceType: 'daily_log',
              sourceId: log.id,
              transactionDate: new Date(input.logDate),
            },
          });
        }
      }

      return log;
    });
  }

  async update(companyId: string, logId: string, input: Partial<DailyLogInput>) {
    const existingLog = await this.prisma.dailyLog.findFirst({
      where: { id: logId, companyId },
    });
    if (!existingLog) throw new NotFoundException('Registro diario no encontrado');

    const batch = await this.prisma.batch.findUnique({
      where: { id: existingLog.batchId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    if (batch.status === 'planned') {
      throw new BadRequestException('No se pueden modificar registros de un lote en planificacion');
    }
    // The same two products `create` validates above, missing here. The
    // response includes `medicineProduct` and `feedProduct` with their names,
    // so sending another company's UUID through this path attached it to the
    // log and handed it back.
    if (input.medicineProductId) {
      const medicineProduct = await this.prisma.product.findFirst({
        where: { id: input.medicineProductId, companyId },
      });
      if (!medicineProduct) throw new NotFoundException('Producto de medicina no encontrado');
    }
    if (input.feedProductId) {
      const feedProduct = await this.prisma.product.findFirst({
        where: { id: input.feedProductId, companyId },
      });
      if (!feedProduct) throw new NotFoundException('Producto de alimento no encontrado');
    }

    if (input.mortality !== undefined) {
      const mortalityDiff = input.mortality - existingLog.mortality;
      if (mortalityDiff > 0 && mortalityDiff > batch.currentQuantity) {
        throw new BadRequestException(
          `El aumento de mortalidad (${mortalityDiff}) excederia la cantidad actual del lote (${batch.currentQuantity})`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const log = await tx.dailyLog.update({
        where: { id: logId },
        data: {
          ...(input.logDate !== undefined && { logDate: new Date(input.logDate) }),
          ...(input.waterConsumedL !== undefined && { waterConsumedL: input.waterConsumedL }),
          ...(input.mortality !== undefined && { mortality: input.mortality }),
          ...(input.averageWeightG !== undefined && { averageWeightG: input.averageWeightG }),
          ...(input.temperatureC !== undefined && { temperatureC: input.temperatureC }),
          ...(input.humidityPct !== undefined && { humidityPct: input.humidityPct }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.medicineAdministered !== undefined && { medicineAdministered: input.medicineAdministered }),
          ...(input.medicineNotes !== undefined && { medicineNotes: input.medicineNotes }),
          ...(input.medicineProductId !== undefined && { medicineProductId: input.medicineProductId }),
          ...(input.medicineQuantity !== undefined && { medicineQuantity: input.medicineQuantity }),
          ...(input.feedConsumedKg !== undefined && { feedConsumedKg: input.feedConsumedKg }),
          ...(input.feedProductId !== undefined && { feedProductId: input.feedProductId }),
          ...(input.healthScore !== undefined && { healthScore: input.healthScore }),
        },
        include: {
          batch: true,
          medicineProduct: { select: { id: true, name: true, measurementUnit: true } },
          feedProduct: { select: { id: true, name: true, measurementUnit: true } },
        },
      });

      if (input.mortality !== undefined) {
        const mortalityDiff = input.mortality - existingLog.mortality;
        if (mortalityDiff !== 0) {
          await tx.batch.update({
            where: { id: existingLog.batchId },
            data: { currentQuantity: { decrement: mortalityDiff } },
          });
        }
      }

      return log;
    });
  }

  async remove(companyId: string, logId: string) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, companyId },
    });
    if (!log) throw new NotFoundException('Registro diario no encontrado');

    return this.prisma.$transaction(async (tx) => {
      // Revert mortality
      if (log.mortality > 0) {
        await tx.batch.update({
          where: { id: log.batchId },
          data: { currentQuantity: { increment: log.mortality } },
        });
      }

      // Revert medicine stock + delete expense transaction
      if (log.medicineProductId && log.medicineQuantity) {
        await tx.product.update({
          where: { id: log.medicineProductId },
          data: { currentStock: { increment: log.medicineQuantity } },
        });
        await tx.transaction.deleteMany({
          where: { sourceType: 'daily_log', sourceId: log.id },
        });
      }

      // Revert feed consumption + delete expense transaction
      if (log.feedProductId && log.feedConsumedKg) {
        await tx.feedConsumption.deleteMany({
          where: {
            batchId: log.batchId,
            consumptionDate: log.logDate,
          },
        });

        await tx.product.update({
          where: { id: log.feedProductId },
          data: { currentStock: { increment: log.feedConsumedKg } },
        });

        await tx.transaction.deleteMany({
          where: { sourceType: 'daily_log', sourceId: log.id, category: 'feed' },
        });
      }

      await tx.dailyLog.delete({ where: { id: logId } });
      return { success: true };
    });
  }
}
