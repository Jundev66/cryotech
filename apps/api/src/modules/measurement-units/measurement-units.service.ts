import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MeasurementUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.measurementUnit.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: string, input: { name: string; abbreviation: string }) {
    const existing = await this.prisma.measurementUnit.findUnique({
      where: { companyId_abbreviation: { companyId, abbreviation: input.abbreviation } },
    });
    if (existing) throw new ConflictException('Ya existe una unidad con esa abreviatura');

    return this.prisma.measurementUnit.create({
      data: { companyId, name: input.name, abbreviation: input.abbreviation },
    });
  }

  async update(companyId: string, id: string, input: { name?: string; abbreviation?: string }) {
    const unit = await this.prisma.measurementUnit.findFirst({ where: { id, companyId } });
    if (!unit) throw new NotFoundException('Unidad no encontrada');

    if (input.abbreviation && input.abbreviation !== unit.abbreviation) {
      const existing = await this.prisma.measurementUnit.findUnique({
        where: { companyId_abbreviation: { companyId, abbreviation: input.abbreviation } },
      });
      if (existing) throw new ConflictException('Ya existe una unidad con esa abreviatura');
    }

    return this.prisma.measurementUnit.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.abbreviation !== undefined && { abbreviation: input.abbreviation }),
      },
    });
  }

  async remove(companyId: string, id: string) {
    const unit = await this.prisma.measurementUnit.findFirst({ where: { id, companyId } });
    if (!unit) throw new NotFoundException('Unidad no encontrada');

    const productsCount = await this.prisma.product.count({ where: { unitId: id } });
    if (productsCount > 0) {
      throw new ConflictException(`No se puede eliminar: ${productsCount} producto(s) usan esta unidad`);
    }

    await this.prisma.measurementUnit.delete({ where: { id } });
    return { success: true };
  }

  async seedDefaults(companyId: string) {
    const defaults = [
      { name: 'Kilogramos', abbreviation: 'kg' },
      { name: 'Gramos', abbreviation: 'g' },
      { name: 'Litros', abbreviation: 'L' },
      { name: 'Mililitros', abbreviation: 'mL' },
      { name: 'Unidades', abbreviation: 'unid' },
    ];

    await this.prisma.measurementUnit.createMany({
      data: defaults.map((d) => ({ companyId, ...d })),
      skipDuplicates: true,
    });
  }
}
