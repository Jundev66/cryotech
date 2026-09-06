import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProductConsumptionInput } from '@cryotech/shared-types';

@Injectable()
export class ProductConsumptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, filters?: { batchId?: string; productId?: string }) {
    return this.prisma.productConsumption.findMany({
      where: {
        companyId,
        ...(filters?.batchId && { batchId: filters.batchId }),
        ...(filters?.productId && { productId: filters.productId }),
      },
      include: {
        batch: true,
        product: true,
      },
      orderBy: { consumptionDate: 'desc' },
    });
  }

  async create(companyId: string, input: ProductConsumptionInput) {
    // Validate batch status if batchId is provided
    if (input.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: input.batchId, companyId },
      });
      if (batch && (batch.status === 'planned' || batch.status === 'finished')) {
        throw new BadRequestException('No se pueden registrar consumos en un lote planificado o finalizado');
      }
    }

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, companyId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.productType === 'equipment') {
      throw new BadRequestException('Equipment products cannot be consumed. Only consumable products are allowed.');
    }

    if (Number(product.currentStock) < input.quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${product.currentStock}, requested: ${input.quantity}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const consumption = await tx.productConsumption.create({
        data: {
          companyId,
          batchId: input.batchId,
          productId: input.productId,
          consumptionDate: input.consumptionDate ? new Date(input.consumptionDate) : new Date(),
          quantity: input.quantity,
          notes: input.notes ?? null,
        },
        include: {
          product: true,
          batch: true,
        },
      });

      await tx.product.update({
        where: { id: input.productId },
        data: {
          currentStock: { decrement: input.quantity },
        },
      });

      return consumption;
    });
  }

  async remove(companyId: string, consumptionId: string) {
    const consumption = await this.prisma.productConsumption.findFirst({
      where: { id: consumptionId, companyId },
    });

    if (!consumption) {
      throw new NotFoundException('Product consumption not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: consumption.productId },
        data: {
          currentStock: { increment: Number(consumption.quantity) },
        },
      });

      await tx.productConsumption.delete({
        where: { id: consumptionId },
      });
    });

    return { success: true };
  }
}
