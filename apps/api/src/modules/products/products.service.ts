import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { textSearchWhere } from '../../common/search/search.util';
import { SequenceService } from '../../common/services/sequence.service';
import type { ProductInput } from '@cryotech/shared-types';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
  ) {}

  async findAll(companyId: string, filters?: { search?: string }) {
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        ...textSearchWhere(filters?.search, ['code', 'name', 'category.name']),
      },
      orderBy: { name: 'asc' },
      include: { category: true, measurementUnit: true },
    });

    return products.map((product) => ({
      ...product,
      lowStock: Number(product.currentStock) <= Number(product.minStock),
    }));
  }

  async findOne(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
      include: { category: true, measurementUnit: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return {
      ...product,
      lowStock: Number(product.currentStock) <= Number(product.minStock),
    };
  }

  async getLowStockAlerts(companyId: string) {
    return this.prisma.product.findMany({
      where: {
        companyId,
        currentStock: { lte: this.prisma.product.fields.minStock },
      },
      include: { category: true, measurementUnit: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * The category and the unit have to belong to this company.
   *
   * Both arrive from the body and used to be written as they came. The response
   * includes `category` and `measurementUnit`, so sending another company's
   * UUID did not just attach the product to something foreign: it returned its
   * name.
   */
  private async assertCatalog(companyId: string, categoryId?: string, unitId?: string) {
    if (categoryId) {
      const category = await this.prisma.productCategoryConfig.findFirst({
        where: { id: categoryId, companyId },
      });
      if (!category) throw new NotFoundException('Categoría no encontrada');
    }
    if (unitId) {
      const unit = await this.prisma.measurementUnit.findFirst({
        where: { id: unitId, companyId },
      });
      if (!unit) throw new NotFoundException('Unidad de medida no encontrada');
    }
  }

  async create(companyId: string, input: ProductInput) {
    await this.assertCatalog(companyId, input.categoryId, input.unitId);

    const code = await this.sequenceService.next(companyId, 'product');

    return this.prisma.product.create({
      data: {
        companyId,
        code,
        name: input.name,
        categoryId: input.categoryId,
        unitId: input.unitId,
        currentStock: input.currentStock,
        minStock: input.minStock,
      },
      include: { category: true, measurementUnit: true },
    });
  }

  async update(companyId: string, productId: string, input: Partial<ProductInput>) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');

    await this.assertCatalog(companyId, input.categoryId, input.unitId);

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.unitId !== undefined && { unitId: input.unitId }),
        ...(input.currentStock !== undefined && { currentStock: input.currentStock }),
        ...(input.minStock !== undefined && { minStock: input.minStock }),
      },
      include: { category: true, measurementUnit: true },
    });
  }

  async remove(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.product.delete({ where: { id: productId } });
    return { success: true };
  }
}
