import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementUnitsService } from '../measurement-units/measurement-units.service';
import { ProductCategoriesService } from '../product-categories/product-categories.service';
import type { CompanyInput } from '@cryotech/shared-types';

const DEFAULT_ROLES = [
  {
    name: 'Administrador',
    permissions: {
      batches: { view: true, create: true, edit: true, delete: true },
      daily_logs: { view: true, create: true, edit: true, delete: true },
      sales: { view: true, create: true, edit: true, delete: true },
      transactions: { view: true, create: true, edit: true, delete: true },
      entries: { view: true, create: true, edit: true, delete: true },
      processing: { view: true, create: true, edit: true, delete: true },
      clients: { view: true, create: true, edit: true, delete: true },
      products: { view: true, create: true, edit: true, delete: true },
      warehouses: { view: true, create: true, edit: true, delete: true },
      reports: { view: true },
      settings: { view: true, edit: true },
      users: { view: true, create: true, edit: true, delete: true },
    },
  },
  {
    name: 'Gestion de Compra y Venta',
    permissions: {
      batches: { view: true, create: false, edit: false, delete: false },
      daily_logs: { view: true, create: false, edit: false, delete: false },
      sales: { view: true, create: true, edit: true, delete: false },
      transactions: { view: true, create: true, edit: true, delete: false },
      entries: { view: true, create: true, edit: true, delete: false },
      processing: { view: true, create: true, edit: true, delete: false },
      clients: { view: true, create: true, edit: true, delete: false },
      products: { view: true, create: true, edit: true, delete: false },
      warehouses: { view: true, create: false, edit: false, delete: false },
      reports: { view: true },
      settings: { view: false, edit: false },
      users: { view: false, create: false, edit: false, delete: false },
    },
  },
  {
    name: 'Trabajador de Galpon',
    permissions: {
      batches: { view: true, create: false, edit: false, delete: false },
      daily_logs: { view: true, create: true, edit: true, delete: false },
      sales: { view: false, create: false, edit: false, delete: false },
      transactions: { view: false, create: false, edit: false, delete: false },
      entries: { view: false, create: false, edit: false, delete: false },
      processing: { view: false, create: false, edit: false, delete: false },
      clients: { view: false, create: false, edit: false, delete: false },
      products: { view: true, create: false, edit: false, delete: false },
      warehouses: { view: true, create: false, edit: false, delete: false },
      reports: { view: false },
      settings: { view: false, edit: false },
      users: { view: false, create: false, edit: false, delete: false },
    },
  },
];

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurementUnitsService: MeasurementUnitsService,
    private readonly productCategoriesService: ProductCategoriesService,
  ) {}

  async create(userId: string, input: CompanyInput) {
    const company = await this.prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: { ownerId: userId, name: input.name, phone: input.phone, address: input.address },
      });

      // Create default roles
      const roles = await Promise.all(
        DEFAULT_ROLES.map((role) =>
          tx.role.create({
            data: { companyId: newCompany.id, name: role.name, permissions: role.permissions },
          }),
        ),
      );

      // Add owner as member with admin role
      const adminRole = roles.find((r) => r.name === 'Administrador');
      await tx.companyMember.create({
        data: { companyId: newCompany.id, userId, roleId: adminRole?.id, isOwner: true },
      });

      return newCompany;
    });

    // Seed defaults outside the transaction (uses service methods)
    await this.measurementUnitsService.seedDefaults(company.id);
    await this.productCategoriesService.seedDefaults(company.id);

    return company;
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.companyMember.findMany({
      where: { userId },
      include: { company: true },
    });
    return memberships.map((m) => ({ ...m.company, isOwner: m.isOwner }));
  }

  /**
   * Reads a company, but only for someone who belongs to it.
   *
   * This endpoint sits outside `CompanyMembershipGuard` (it is what the client
   * calls to discover which companies it may use), so the membership check has
   * to happen here. Without it any authenticated user could read any company's
   * name, phone and address just by knowing its UUID.
   */
  async findOne(companyId: string, userId: string) {
    const membership = await this.prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId } },
    });
    // Deliberately the same error as a missing company: telling a stranger
    // "it exists but is not yours" confirms the UUID is real.
    if (!membership) throw new NotFoundException('Empresa no encontrada');

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async update(companyId: string, userId: string, data: Partial<CompanyInput>) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    if (company.ownerId !== userId) throw new ForbiddenException('Solo el propietario puede actualizar la empresa');

    return this.prisma.company.update({ where: { id: companyId }, data });
  }

  async remove(companyId: string, userId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    if (company.ownerId !== userId) throw new ForbiddenException('Solo el propietario puede eliminar la empresa');

    await this.prisma.company.delete({ where: { id: companyId } });
    return { success: true };
  }
}
