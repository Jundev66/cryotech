import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CurrentMemberInfo } from '../../common/decorators/current-member.decorator';
import type { RoleInput, RoleUpdateInput } from '@cryotech/shared-types';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.role.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(companyId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(companyId: string, input: RoleInput) {
    const existing = await this.prisma.role.findUnique({
      where: { companyId_name: { companyId, name: input.name } },
    });
    if (existing) throw new BadRequestException('A role with this name already exists');

    return this.prisma.role.create({
      data: {
        companyId,
        name: input.name,
        permissions: input.permissions as object,
      },
    });
  }

  /**
   * Edits a role — but never the caller's own.
   *
   * Granting yourself a permission you were not given is the whole shape of
   * privilege escalation, and `settings.edit` is a narrow permission that
   * should not be a path to every other one. An owner is exempt because they
   * already hold everything, so there is nothing left to escalate to.
   */
  async update(
    companyId: string,
    roleId: string,
    input: RoleUpdateInput,
    member?: CurrentMemberInfo,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId },
    });
    if (!role) throw new NotFoundException('Role not found');

    if (member && !member.isOwner && member.roleId === roleId) {
      throw new ForbiddenException(
        'No puedes editar tu propio rol. Pídeselo al propietario de la empresa.',
      );
    }

    if (input.name && input.name !== role.name) {
      const existing = await this.prisma.role.findUnique({
        where: { companyId_name: { companyId, name: input.name } },
      });
      if (existing) throw new BadRequestException('A role with this name already exists');
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.permissions !== undefined && { permissions: input.permissions as object }),
      },
    });
  }

  async remove(companyId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId },
    });
    if (!role) throw new NotFoundException('Role not found');

    // Check if any members are using this role
    const membersUsingRole = await this.prisma.companyMember.count({
      where: { roleId },
    });
    if (membersUsingRole > 0) {
      throw new BadRequestException(
        `Cannot delete role: ${membersUsingRole} member(s) are still assigned to it`,
      );
    }

    await this.prisma.role.delete({ where: { id: roleId } });
    return { success: true };
  }
}
