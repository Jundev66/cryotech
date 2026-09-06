import { Injectable, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from './sequence.service';

export const PROCESSED_BIRD_PRODUCT = 'Pollo Beneficiado';

type Client = Prisma.TransactionClient;

/**
 * Stock of processed (slaughtered) birds, counted in units.
 *
 * A batch holds live birds. Processing moves birds out of the batch and into
 * this stock; a `dead` sale takes them out of it. Live sales never touch it.
 * Without this, a `dead` sale would decrement the batch a second time — the
 * bird was already discounted when it was processed.
 */
@Injectable()
export class ProcessedStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
  ) {}

  /** The company's processed-bird product, created on first use. */
  async resolveProduct(client: Client, companyId: string) {
    const existing = await client.product.findFirst({
      where: { companyId, name: PROCESSED_BIRD_PRODUCT },
    });
    if (existing) return existing;

    const [category, unit] = await Promise.all([
      client.productCategoryConfig.findFirst({ where: { companyId, name: 'Otro' } }),
      client.measurementUnit.findFirst({ where: { companyId, name: 'Unidades' } }),
    ]);
    if (!category || !unit) {
      throw new BadRequestException(
        'Faltan la categoría "Otro" o la unidad "Unidades" para crear el producto de beneficiados',
      );
    }

    const code = await this.sequenceService.next(companyId, 'product', client);
    return client.product.create({
      data: {
        companyId,
        code,
        name: PROCESSED_BIRD_PRODUCT,
        categoryId: category.id,
        unitId: unit.id,
        productType: 'consumable',
        currentStock: 0,
      },
    });
  }

  /** Adds processed birds to stock. Returns the product they landed in. */
  async increment(client: Client, companyId: string, quantity: number) {
    const product = await this.resolveProduct(client, companyId);
    await client.product.update({
      where: { id: product.id },
      data: { currentStock: { increment: quantity } },
    });
    return product;
  }

  /** Takes processed birds out of stock, refusing to go negative. */
  async decrement(client: Client, companyId: string, quantity: number) {
    const product = await this.resolveProduct(client, companyId);
    const available = Number(product.currentStock);
    if (quantity > available) {
      throw new BadRequestException(
        `Solo hay ${available} pollos beneficiados en inventario (intentas vender ${quantity})`,
      );
    }
    await client.product.update({
      where: { id: product.id },
      data: { currentStock: { decrement: quantity } },
    });
    return product;
  }

  /** Current count, without creating the product if it does not exist yet. */
  async available(companyId: string): Promise<number> {
    const product = await this.prisma.product.findFirst({
      where: { companyId, name: PROCESSED_BIRD_PRODUCT },
      select: { currentStock: true },
    });
    return product ? Number(product.currentStock) : 0;
  }
}
