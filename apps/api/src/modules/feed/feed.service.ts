import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { textSearchWhere } from '../../common/search/search.util';
import { DEFAULT_FEED_FORMULAS } from '@cryotech/shared-types';
import type { ConsumptionStatus, Prisma } from '@prisma/client';
import type { FeedFormulaInput } from '@cryotech/shared-types';

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Feed Formula CRUD ---

  async findAllFormulas(companyId: string) {
    return this.prisma.feedFormula.findMany({
      where: { companyId },
      orderBy: [{ breed: 'asc' }, { weekNumber: 'asc' }],
    });
  }

  async findOneFormula(companyId: string, formulaId: string) {
    const formula = await this.prisma.feedFormula.findFirst({
      where: { id: formulaId, companyId },
    });
    if (!formula) throw new NotFoundException('Formula de alimentacion no encontrada');
    return formula;
  }

  async createFormula(companyId: string, input: FeedFormulaInput) {
    const existing = await this.prisma.feedFormula.findFirst({
      where: {
        companyId,
        breed: input.breed,
        weekNumber: input.weekNumber,
        feedPhase: input.feedPhase ?? null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una formula para ${input.breed} semana ${input.weekNumber}`,
      );
    }

    return this.prisma.feedFormula.create({
      data: {
        companyId,
        breed: input.breed,
        weekNumber: input.weekNumber,
        dailyFeedPerBirdG: input.dailyFeedPerBirdG,
        feedPhase: input.feedPhase ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  async updateFormula(companyId: string, formulaId: string, input: Partial<FeedFormulaInput>) {
    const formula = await this.prisma.feedFormula.findFirst({
      where: { id: formulaId, companyId },
    });
    if (!formula) throw new NotFoundException('Formula de alimentacion no encontrada');

    return this.prisma.feedFormula.update({
      where: { id: formulaId },
      data: {
        ...(input.breed !== undefined && { breed: input.breed }),
        ...(input.weekNumber !== undefined && { weekNumber: input.weekNumber }),
        ...(input.dailyFeedPerBirdG !== undefined && { dailyFeedPerBirdG: input.dailyFeedPerBirdG }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
  }

  async removeFormula(companyId: string, formulaId: string) {
    const formula = await this.prisma.feedFormula.findFirst({
      where: { id: formulaId, companyId },
    });
    if (!formula) throw new NotFoundException('Formula de alimentacion no encontrada');

    await this.prisma.feedFormula.delete({ where: { id: formulaId } });
    return { success: true };
  }

  // --- Feed Consumption ---

  async findAllConsumptions(
    companyId: string,
    filters?: { batchId?: string; status?: ConsumptionStatus; search?: string },
  ) {
    return this.prisma.feedConsumption.findMany({
      where: {
        companyId,
        ...(filters?.batchId && { batchId: filters.batchId }),
        ...(filters?.status && { status: filters.status }),
        ...textSearchWhere(filters?.search, ['notes', 'product.name', 'batch.breed']),
      },
      include: {
        batch: { select: { id: true, breed: true, status: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: { consumptionDate: 'desc' },
    });
  }

  async createConsumption(companyId: string, input: {
    batchId: string;
    productId: string;
    consumptionDate: string;
    quantityKg: number;
    notes?: string;
  }) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: input.batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    if (batch.status !== 'breeding' && batch.status !== 'for_sale') {
      throw new BadRequestException('Solo se puede registrar consumo en lotes activos');
    }

    // El lote se validaba; el producto no. La respuesta devuelve su nombre.
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, companyId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const consumptionDate = new Date(input.consumptionDate);
    consumptionDate.setHours(0, 0, 0, 0);

    const existing = await this.prisma.feedConsumption.findUnique({
      where: {
        batchId_consumptionDate: { batchId: input.batchId, consumptionDate },
      },
    });
    if (existing) {
      throw new BadRequestException('Ya existe un registro de consumo para este lote en esa fecha');
    }

    return this.prisma.feedConsumption.create({
      data: {
        companyId,
        batchId: input.batchId,
        productId: input.productId,
        consumptionDate,
        quantityKg: input.quantityKg,
        isAutoCalculated: false,
        isAutoGenerated: false,
        status: 'pending',
        notes: input.notes ?? null,
      },
      include: {
        batch: { select: { id: true, breed: true, status: true } },
        product: { select: { id: true, name: true } },
      },
    });
  }

  async updateConsumption(companyId: string, consumptionId: string, input: {
    quantityKg?: number;
    productId?: string;
    notes?: string;
  }) {
    const consumption = await this.prisma.feedConsumption.findFirst({
      where: { id: consumptionId, companyId },
    });
    if (!consumption) throw new NotFoundException('Consumo no encontrado');

    if (consumption.status !== 'pending') {
      throw new BadRequestException('Solo se pueden editar consumos pendientes');
    }

    if (input.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: input.productId, companyId },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');
    }

    return this.prisma.feedConsumption.update({
      where: { id: consumptionId },
      data: {
        ...(input.quantityKg !== undefined && { quantityKg: input.quantityKg }),
        ...(input.productId !== undefined && { productId: input.productId }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: {
        batch: { select: { id: true, breed: true, status: true } },
        product: { select: { id: true, name: true } },
      },
    });
  }

  async approveConsumption(companyId: string, consumptionId: string) {
    const consumption = await this.prisma.feedConsumption.findFirst({
      where: { id: consumptionId, companyId },
    });
    if (!consumption) throw new NotFoundException('Consumo no encontrado');

    if (consumption.status !== 'pending') {
      throw new BadRequestException('Solo se pueden aprobar consumos pendientes');
    }

    const effectiveQty = Number(consumption.quantityKg);

    if (consumption.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: consumption.productId, companyId },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');

      if (Number(product.currentStock) < effectiveQty) {
        throw new BadRequestException(
          `Stock insuficiente de "${product.name}": disponible ${product.currentStock}, requerido ${effectiveQty}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const isAdjusted = consumption.adjustedQuantityKg !== null;
      const updated = await tx.feedConsumption.update({
        where: { id: consumptionId },
        data: { status: isAdjusted ? 'adjusted' : 'confirmed' },
        include: {
          batch: { select: { id: true, breed: true, status: true } },
          product: { select: { id: true, name: true } },
        },
      });

      // Deduct stock
      if (consumption.productId) {
        await tx.product.update({
          where: { id: consumption.productId },
          data: { currentStock: { decrement: effectiveQty } },
        });
      }

      return updated;
    });
  }

  async adjustConsumption(companyId: string, consumptionId: string, adjustedQuantityKg: number) {
    const consumption = await this.prisma.feedConsumption.findFirst({
      where: { id: consumptionId, companyId },
    });
    if (!consumption) throw new NotFoundException('Consumo no encontrado');

    if (consumption.status !== 'pending') {
      throw new BadRequestException('Solo se pueden ajustar consumos pendientes');
    }

    return this.prisma.feedConsumption.update({
      where: { id: consumptionId },
      data: {
        adjustedQuantityKg,
        quantityKg: adjustedQuantityKg,
      },
      include: {
        batch: { select: { id: true, breed: true, status: true } },
        product: { select: { id: true, name: true } },
      },
    });
  }

  async rejectConsumption(companyId: string, consumptionId: string) {
    const consumption = await this.prisma.feedConsumption.findFirst({
      where: { id: consumptionId, companyId },
    });
    if (!consumption) throw new NotFoundException('Consumo no encontrado');

    if (consumption.status !== 'pending') {
      throw new BadRequestException('Solo se pueden rechazar consumos pendientes');
    }

    if (!consumption.isAutoGenerated) {
      throw new BadRequestException('Solo se pueden rechazar consumos auto-generados');
    }

    await this.prisma.feedConsumption.delete({ where: { id: consumptionId } });
    return { success: true };
  }

  /**
   * Every active batch in the system. Scheduler only: it crosses companies on
   * purpose, so no request-scoped caller reaches it.
   */
  async autoGenerateForAllBatches() {
    return this.autoGenerateForActiveBatches({ status: 'breeding' });
  }

  /** The same run, scoped to one company — what an HTTP caller may trigger. */
  async autoGenerateForCompany(companyId: string) {
    return this.autoGenerateForActiveBatches({ companyId, status: 'breeding' });
  }

  private async autoGenerateForActiveBatches(where: Prisma.BatchWhereInput) {
    const activeBatches = await this.prisma.batch.findMany({
      where,
      select: { id: true, companyId: true },
    });

    let generated = 0;
    let skipped = 0;

    for (const batch of activeBatches) {
      try {
        const result = await this.autoGenerateForBatch(batch.companyId, batch.id);
        if (result) {
          generated++;
        } else {
          skipped++;
        }
      } catch (error) {
        this.logger.error(`Error auto-generating feed for batch ${batch.id}: ${error}`);
      }
    }

    this.logger.log(`Auto feed generation: ${generated} generated, ${skipped} skipped`);
    return { generated, skipped };
  }

  /**
   * Auto-generate feed consumption for a specific batch.
   * Returns null if a record already exists for today.
   */
  async autoGenerateForBatch(companyId: string, batchId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId, status: 'breeding' },
    });
    if (!batch) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if manual or auto consumption already exists for today
    const existing = await this.prisma.feedConsumption.findUnique({
      where: {
        batchId_consumptionDate: { batchId, consumptionDate: today },
      },
    });
    if (existing) return null;

    // Calculate week number
    const startDate = new Date(batch.startDate);
    const diffMs = today.getTime() - startDate.getTime();
    const daysSinceStart = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const weekNumber = Math.ceil(daysSinceStart / 7) || 1;

    // Determine feed phase
    const phaseConfig = await this.prisma.feedPhaseConfig.findFirst({
      where: { companyId, breed: batch.breed },
    });
    const engordeStartWeek = phaseConfig?.engordeStartWeek ?? 4;
    const feedPhase = weekNumber < engordeStartWeek ? 'inicio' : 'engorde';

    // Find formula
    let dailyFeedPerBirdG: number | null = null;

    const formulaWithPhase = await this.prisma.feedFormula.findFirst({
      where: { companyId, breed: batch.breed, weekNumber, feedPhase },
    });

    if (formulaWithPhase) {
      dailyFeedPerBirdG = Number(formulaWithPhase.dailyFeedPerBirdG);
    } else {
      const formulaNoPhase = await this.prisma.feedFormula.findFirst({
        where: { companyId, breed: batch.breed, weekNumber, feedPhase: null },
      });

      if (formulaNoPhase) {
        dailyFeedPerBirdG = Number(formulaNoPhase.dailyFeedPerBirdG);
      } else {
        const defaults = DEFAULT_FEED_FORMULAS[batch.breed];
        if (defaults && defaults[weekNumber]) {
          dailyFeedPerBirdG = defaults[weekNumber];
        }
      }
    }

    if (dailyFeedPerBirdG === null) return null;

    const totalKg = Math.round((dailyFeedPerBirdG * batch.currentQuantity) / 1000 * 1000) / 1000;

    // Find the most recently used feed product for this batch
    const lastConsumption = await this.prisma.feedConsumption.findFirst({
      where: { batchId, productId: { not: null } },
      orderBy: { consumptionDate: 'desc' },
    });

    // Or find a default feed product (category slug = 'feed')
    let productId = lastConsumption?.productId ?? null;
    if (!productId) {
      const feedProduct = await this.prisma.product.findFirst({
        where: {
          companyId,
          category: { slug: 'feed' },
        },
        orderBy: { createdAt: 'asc' },
      });
      productId = feedProduct?.id ?? null;
    }

    return this.prisma.feedConsumption.create({
      data: {
        companyId,
        batchId,
        productId,
        consumptionDate: today,
        quantityKg: totalKg,
        isAutoCalculated: true,
        isAutoGenerated: true,
        status: 'pending',
      },
      include: {
        batch: { select: { id: true, breed: true, status: true } },
        product: { select: { id: true, name: true } },
      },
    });
  }

  // --- Feed Phase Config CRUD ---

  async findAllPhaseConfigs(companyId: string) {
    return this.prisma.feedPhaseConfig.findMany({
      where: { companyId },
      orderBy: { breed: 'asc' },
    });
  }

  async createPhaseConfig(companyId: string, input: { breed: string; engordeStartWeek: number }) {
    return this.prisma.feedPhaseConfig.upsert({
      where: {
        companyId_breed: {
          companyId,
          breed: input.breed,
        },
      },
      update: {
        engordeStartWeek: input.engordeStartWeek,
      },
      create: {
        companyId,
        breed: input.breed,
        engordeStartWeek: input.engordeStartWeek,
      },
    });
  }

  async updatePhaseConfig(companyId: string, configId: string, input: { breed?: string; engordeStartWeek?: number }) {
    const config = await this.prisma.feedPhaseConfig.findFirst({
      where: { id: configId, companyId },
    });
    if (!config) throw new NotFoundException('Configuracion de fase no encontrada');

    return this.prisma.feedPhaseConfig.update({
      where: { id: configId },
      data: {
        ...(input.breed !== undefined && { breed: input.breed }),
        ...(input.engordeStartWeek !== undefined && { engordeStartWeek: input.engordeStartWeek }),
      },
    });
  }
}
