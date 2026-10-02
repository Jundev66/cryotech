import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { textSearchWhere } from '../../common/search/search.util';
import { SequenceService } from '../../common/services/sequence.service';
import type { WarehouseInput } from '@cryotech/shared-types';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
  ) {}

  async findAll(companyId: string, filters?: { search?: string }) {
    return this.prisma.warehouse.findMany({
      where: {
        companyId,
        ...textSearchWhere(filters?.search, ['code', 'name', 'location']),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { batches: true } },
      },
    });
  }

  async findOne(companyId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId },
      include: {
        _count: { select: { batches: true } },
      },
    });
    if (!warehouse) throw new NotFoundException('Galpón no encontrado');
    return warehouse;
  }

  async create(companyId: string, input: WarehouseInput) {
    const code = await this.sequenceService.next(companyId, 'warehouse');

    return this.prisma.warehouse.create({
      data: {
        companyId,
        code,
        name: input.name,
        capacity: input.capacity ?? null,
        location: input.location ?? null,
      },
    });
  }

  async update(companyId: string, warehouseId: string, input: Partial<WarehouseInput>) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId },
    });
    if (!warehouse) throw new NotFoundException('Galpón no encontrado');

    return this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.capacity !== undefined && { capacity: input.capacity }),
        ...(input.location !== undefined && { location: input.location }),
      },
    });
  }

  async remove(companyId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId },
    });
    if (!warehouse) throw new NotFoundException('Galpón no encontrado');

    const activeBatches = await this.prisma.batch.count({
      where: { warehouseId, status: { not: 'finished' } },
    });
    if (activeBatches > 0) {
      throw new BadRequestException(
        `No se puede eliminar el galpón: tiene ${activeBatches} lote(s) activo(s)`,
      );
    }

    await this.prisma.warehouse.delete({ where: { id: warehouseId } });
    return { success: true };
  }
}
