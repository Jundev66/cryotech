import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { textSearchWhere } from '../../common/search/search.util';
import { SequenceService } from '../../common/services/sequence.service';
import { ProcessedStockService } from '../../common/services/processed-stock.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import type { ProcessingInput } from '@cryotech/shared-types';
import type { TransactionType, TransactionCategory } from '@prisma/client';

@Injectable()
export class ProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly processedStock: ProcessedStockService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async findAll(companyId: string, batchId?: string, search?: string) {
    return this.prisma.processing.findMany({
      where: {
        companyId,
        ...(batchId && { batchId }),
        ...textSearchWhere(search, ['code', 'supplierName', 'notes', 'batch.breed']),
      },
      include: {
        batch: {
          include: {
            warehouse: { select: { id: true, name: true } },
          },
        },
        product: { include: { measurementUnit: true } },
      },
      orderBy: { processingDate: 'desc' },
    });
  }

  async create(companyId: string, input: ProcessingInput) {
    // Validate batch exists and belongs to this company
    const batch = await this.prisma.batch.findFirst({
      where: { id: input.batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Batch not found in this company');

    // Validate batch status must be 'for_sale'
    if (batch.status !== 'for_sale') {
      throw new BadRequestException(
        `Batch status must be 'for_sale' to process. Current status: '${batch.status}'`,
      );
    }

    // Validate quantity does not exceed current batch quantity
    if (input.quantity > batch.currentQuantity) {
      throw new BadRequestException(
        `Processing quantity (${input.quantity}) exceeds current batch quantity (${batch.currentQuantity})`,
      );
    }

    // Usually empty, and the company's own "Pollo Beneficiado" is used. When
    // the client does send one it has to be checked: otherwise the slaughter
    // ends up pointing at another farm's product.
    if (input.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: input.productId, companyId },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');
    }

    const code = await this.sequenceService.next(companyId, 'processing');
    const processingDate = input.processingDate ? new Date(input.processingDate) : new Date();

    // The cost arrives in dollars but the books are kept in bolivares, so the
    // bolivar figure has to exist before anything is written. Without it a
    // processing would be unpayable — the payable balance reads totalCostBs.
    let exchangeRate = input.exchangeRate ?? null;
    let totalCostBs = input.totalCostBs ?? null;
    if (totalCostBs === null && input.totalCost > 0) {
      if (exchangeRate === null) {
        const current = await this.exchangeRates.getCurrentRate(companyId);
        if (current.unavailable || !current.effectiveRate) {
          throw new BadRequestException(
            'No hay tasa de cambio disponible: indique la tasa o el costo en bolívares.',
          );
        }
        exchangeRate = current.effectiveRate;
      }
      totalCostBs = round2(input.totalCost * exchangeRate);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Move the birds into processed stock (created on first use)
      const processedProduct = await this.processedStock.increment(tx, companyId, input.quantity);

      // 2. Create Processing record
      const processing = await tx.processing.create({
        data: {
          companyId,
          code,
          batchId: input.batchId,
          quantity: input.quantity,
          liveWeightKg: input.liveWeightKg ?? null,
          processedWeightKg: input.processedWeightKg ?? null,
          weightAdjustmentG: input.weightAdjustmentG ?? 0,
          isSelfProcessed: input.isSelfProcessed ?? false,
          costPerBird: input.costPerBird ?? null,
          costPerKg: input.costPerKg ?? null,
          totalCost: input.totalCost,
          totalCostBs,
          exchangeRate,
          supplierName: input.supplierName ?? null,
          // Doing it yourself costs nothing to anybody, so there is nothing to pay.
          paymentStatus: input.isSelfProcessed || !totalCostBs ? 'paid' : 'pending',
          productId: input.productId ?? processedProduct.id,
          processingDate,
          notes: input.notes ?? null,
        },
        include: {
          batch: {
            include: {
              warehouse: { select: { id: true, name: true } },
            },
          },
          product: { include: { measurementUnit: true } },
        },
      });

      // 3. Decrement batch currentQuantity
      await tx.batch.update({
        where: { id: input.batchId },
        data: { currentQuantity: { decrement: input.quantity } },
      });

      // 4. Recognise the expense — in bolivares. `input.totalCost` is dollars,
      //    and transaction.amount is read as bolivares everywhere else, so
      //    using it here would understate the cost by the exchange rate.
      if (totalCostBs && totalCostBs > 0) {
        const txCode = await this.sequenceService.next(companyId, 'transaction', tx);
        await tx.transaction.create({
          data: {
            companyId,
            code: txCode,
            batchId: input.batchId,
            type: 'expense' as TransactionType,
            category: 'processing' as TransactionCategory,
            amount: totalCostBs,
            description: `Beneficio de ${input.quantity} pollos`,
            sourceType: 'processing',
            sourceId: processing.id,
            // Belongs to the day the birds were processed, not to whenever the
            // record was typed in.
            transactionDate: processingDate,
          },
        });
      }

      // 5. If a weight-based product was named explicitly, track its kg too
      if (input.productId && input.processedWeightKg) {
        await tx.product.update({
          where: { id: input.productId },
          data: { currentStock: { increment: input.processedWeightKg } },
        });
      }

      return processing;
    });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
