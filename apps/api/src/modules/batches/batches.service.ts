import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { textSearchWhere } from '../../common/search/search.util';
import { SequenceService } from '../../common/services/sequence.service';
import { EntriesService } from '../entries/entries.service';
import { VALID_STATUS_TRANSITIONS } from '@cryotech/shared-types';
import type { BatchInput } from '@cryotech/shared-types';

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly entriesService: EntriesService,
  ) {}

  async findAll(companyId: string, filters?: { search?: string }) {
    return this.prisma.batch.findMany({
      where: {
        companyId,
        ...textSearchWhere(filters?.search, ['code', 'breed', 'notes', 'warehouse.name']),
      },
      include: { warehouse: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(companyId: string, batchId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
      include: {
        warehouse: true,
        entryLines: { include: { product: true } },
        processings: true,
      },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    return batch;
  }

  async create(companyId: string, input: BatchInput & { entryLines?: Array<{ productId: string; quantity: number; costPerUnit?: number; deliveryCost?: number; notes?: string }> }) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, companyId },
    });
    if (!warehouse) throw new NotFoundException('Galpon no encontrado');

    // The code is claimed inside the transaction below, so a batch that fails
    // to save does not burn a number and leave a gap in the LOT- sequence.
    const batchData = {
      companyId,
      warehouseId: input.warehouseId,
      breed: input.breed,
      startDate: new Date(input.startDate),
      initialQuantity: input.initialQuantity,
      currentQuantity: input.initialQuantity,
      purchasePricePerUnit: input.purchasePricePerUnit ?? null,
      notes: input.notes ?? null,
      status: 'planned' as const,
    };

    if (input.entryLines && input.entryLines.length > 0) {
      return this.prisma.$transaction(async (tx) => {
        const code = await this.sequenceService.next(companyId, 'batch', tx);
        const batch = await tx.batch.create({
          data: { ...batchData, code },
        });

        for (const line of input.entryLines!) {
          await tx.batchEntryLine.create({
            data: {
              batchId: batch.id,
              productId: line.productId,
              quantity: line.quantity,
              costPerUnit: line.costPerUnit ?? null,
              deliveryCost: line.deliveryCost ?? null,
              notes: line.notes ?? null,
            },
          });
        }

        // OrThrow, not findUnique: it was created two statements ago in this
        // same transaction, so a null here would be a bug — and typing it as
        // nullable pushes that impossible case onto every caller.
        return tx.batch.findUniqueOrThrow({
          where: { id: batch.id },
          include: {
            warehouse: true,
            entryLines: { include: { product: true } },
          },
        });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const code = await this.sequenceService.next(companyId, 'batch', tx);
      return tx.batch.create({
        data: { ...batchData, code },
        include: { warehouse: true },
      });
    });
  }

  async update(companyId: string, batchId: string, input: Partial<BatchInput>) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    if (batch.status === 'finished') {
      throw new BadRequestException('No se puede modificar un lote finalizado');
    }

    if (input.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: input.warehouseId, companyId },
      });
      if (!warehouse) throw new NotFoundException('Galpon no encontrado');
    }

    const data: Record<string, unknown> = {};
    if (input.warehouseId !== undefined) data.warehouseId = input.warehouseId;
    if (input.breed !== undefined) data.breed = input.breed;
    if (input.startDate !== undefined) data.startDate = new Date(input.startDate);
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.purchasePricePerUnit !== undefined) data.purchasePricePerUnit = input.purchasePricePerUnit;

    if (input.initialQuantity !== undefined && batch.status === 'planned') {
      data.initialQuantity = input.initialQuantity;
      data.currentQuantity = input.initialQuantity;
    }

    return this.prisma.batch.update({
      where: { id: batchId },
      data,
      include: { warehouse: true, entryLines: { include: { product: true } } },
    });
  }

  async updateStatus(companyId: string, batchId: string, newStatus: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    const allowedTransitions = VALID_STATUS_TRANSITIONS[batch.status];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Transicion de estado invalida: ${batch.status} -> ${newStatus}. Permitidos: ${(allowedTransitions || []).join(', ') || 'ninguno'}`,
      );
    }

    // Confirming a batch turns its planned lines into real purchases.
    if (batch.status === 'planned' && newStatus === 'breeding') {
      return this.prisma.$transaction(async (tx) => {
        const updatedBatch = await tx.batch.update({
          where: { id: batchId },
          data: { status: newStatus },
          include: { warehouse: true },
        });

        const unprocessedLines = await tx.batchEntryLine.findMany({
          where: { batchId, processed: false },
          include: { product: { include: { category: true } } },
        });

        for (const line of unprocessedLines) {
          // A purchase may already have been registered against this batch —
          // typically because it was paid in advance, which requires the entry
          // to exist before the batch is confirmed. Reuse it instead of
          // creating a second one: doing both would double the stock and the
          // expense, and would strand the payment on an orphaned entry.
          let entry = await tx.productEntry.findFirst({
            where: { companyId, batchId, productId: line.productId, status: 'pending' },
          });

          if (!entry) {
            const totalCost = line.costPerUnit
              ? Number(line.quantity) * Number(line.costPerUnit)
              : null;
            const code = await this.sequenceService.next(companyId, 'entry', tx);

            entry = await tx.productEntry.create({
              data: {
                companyId,
                code,
                productId: line.productId,
                batchId,
                quantity: line.quantity,
                costPerUnit: line.costPerUnit,
                totalCost,
                deliveryCost: line.deliveryCost ?? null,
                status: 'pending',
                entryDate: new Date(),
                notes: line.notes ?? null,
              },
            });
          }

          // One code path for "an entry becomes received", so stock movement,
          // expense recognition and the accounting category live in exactly
          // one place instead of being duplicated here.
          await this.entriesService.receiveWithin(tx, companyId, entry.id);

          await tx.batchEntryLine.update({
            where: { id: line.id },
            data: { processed: true },
          });
        }

        return updatedBatch;
      });
    }

    const data: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'finished') {
      data.endDate = new Date();
    }

    return this.prisma.batch.update({
      where: { id: batchId },
      data,
      include: { warehouse: true },
    });
  }

  async addEntryLine(
    companyId: string,
    batchId: string,
    input: { productId: string; quantity: number; costPerUnit?: number; deliveryCost?: number; notes?: string },
  ) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    if (batch.status !== 'planned') {
      throw new BadRequestException('Solo se pueden agregar insumos a un lote en planificacion');
    }

    // The batch is checked above; the product arrived from the body unchecked.
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, companyId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    await this.prisma.batchEntryLine.create({
      data: {
        batchId,
        productId: input.productId,
        quantity: input.quantity,
        costPerUnit: input.costPerUnit ?? null,
        deliveryCost: input.deliveryCost ?? null,
        notes: input.notes ?? null,
      },
    });

    return this.findOne(companyId, batchId);
  }

  async updateEntryLine(
    companyId: string,
    batchId: string,
    lineId: string,
    input: { quantity?: number; costPerUnit?: number; deliveryCost?: number; notes?: string },
  ) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    if (batch.status !== 'planned') {
      throw new BadRequestException('Solo se pueden editar insumos de un lote en planificacion');
    }

    const line = await this.prisma.batchEntryLine.findFirst({
      where: { id: lineId, batchId },
    });
    if (!line) throw new NotFoundException('Linea de entrada no encontrada');

    await this.prisma.batchEntryLine.update({
      where: { id: lineId },
      data: {
        ...(input.quantity !== undefined && { quantity: input.quantity }),
        ...(input.costPerUnit !== undefined && { costPerUnit: input.costPerUnit }),
        ...(input.deliveryCost !== undefined && { deliveryCost: input.deliveryCost }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });

    return this.findOne(companyId, batchId);
  }

  async removeEntryLine(companyId: string, batchId: string, lineId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    if (batch.status !== 'planned') {
      throw new BadRequestException('Solo se pueden eliminar insumos de un lote en planificacion');
    }

    const line = await this.prisma.batchEntryLine.findFirst({
      where: { id: lineId, batchId },
    });
    if (!line) throw new NotFoundException('Linea de entrada no encontrada');

    await this.prisma.batchEntryLine.delete({ where: { id: lineId } });
    return this.findOne(companyId, batchId);
  }

  async remove(companyId: string, batchId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    await this.prisma.batch.delete({ where: { id: batchId } });
    return { success: true };
  }
}
