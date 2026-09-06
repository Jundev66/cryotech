import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.productCategoryConfig.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: string, input: { name: string; slug: string }) {
    const existing = await this.prisma.productCategoryConfig.findUnique({
      where: { companyId_slug: { companyId, slug: input.slug } },
    });
    if (existing) throw new ConflictException('Ya existe una categoría con ese identificador');

    return this.prisma.productCategoryConfig.create({
      data: { companyId, name: input.name, slug: input.slug },
    });
  }

  async update(companyId: string, id: string, input: { name?: string; slug?: string }) {
    const category = await this.prisma.productCategoryConfig.findFirst({ where: { id, companyId } });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    if (input.slug && input.slug !== category.slug) {
      const existing = await this.prisma.productCategoryConfig.findUnique({
        where: { companyId_slug: { companyId, slug: input.slug } },
      });
      if (existing) throw new ConflictException('Ya existe una categoría con ese identificador');
    }

    return this.prisma.productCategoryConfig.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
      },
    });
  }

  async remove(companyId: string, id: string) {
    const category = await this.prisma.productCategoryConfig.findFirst({ where: { id, companyId } });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    const productsCount = await this.prisma.product.count({ where: { categoryId: id } });
    if (productsCount > 0) {
      throw new ConflictException(`No se puede eliminar: ${productsCount} producto(s) usan esta categoría`);
    }

    await this.prisma.productCategoryConfig.delete({ where: { id } });
    return { success: true };
  }

  async seedDefaults(companyId: string) {
    const defaults = [
      { name: 'Alimento', slug: 'feed' },
      // Day-old chicks. Without a category of their own the biggest purchase
      // of every batch had nowhere to be booked.
      { name: 'Pollos Bebé', slug: 'chicks' },
      { name: 'Vacuna', slug: 'vaccine' },
      { name: 'Suplemento', slug: 'supplement' },
      { name: 'Equipo', slug: 'equipment' },
      { name: 'Otro', slug: 'other' },
    ];

    await this.prisma.productCategoryConfig.createMany({
      data: defaults.map((d) => ({ companyId, ...d })),
      skipDuplicates: true,
    });
  }
}
