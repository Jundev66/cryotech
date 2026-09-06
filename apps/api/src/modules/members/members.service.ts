import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.companyMember.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true } },
        role: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(companyId: string, memberId: string) {
    const member = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true } },
        role: true,
      },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  async addMember(companyId: string, data: { email: string; roleId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new NotFoundException('User with this email not found');

    const existing = await this.prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId: user.id } },
    });
    if (existing) throw new BadRequestException('User is already a member of this company');

    if (data.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: data.roleId, companyId },
      });
      if (!role) throw new NotFoundException('Role not found in this company');
    }

    return this.prisma.companyMember.create({
      data: { companyId, userId: user.id, roleId: data.roleId ?? null },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true } },
        role: true,
      },
    });
  }

  async updateMember(companyId: string, memberId: string, data: { roleId?: string }) {
    const member = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId },
    });
    if (!member) throw new NotFoundException('Member not found');

    if (member.isOwner) {
      throw new ForbiddenException('Cannot change owner role');
    }

    if (data.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: data.roleId, companyId },
      });
      if (!role) throw new NotFoundException('Role not found in this company');
    }

    return this.prisma.companyMember.update({
      where: { id: memberId },
      data: { roleId: data.roleId ?? null },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true } },
        role: true,
      },
    });
  }

  /**
   * Sets a new password for a member. This is the recovery path.
   *
   * There is no self-service by email — the project has nowhere to send it — so
   * when a worker forgot theirs the only way out was `psql`. Now whoever runs
   * the company changes it.
   *
   * Two things are not optional:
   *
   * - **Not the owner.** Anyone but them, same as with the role and with
   *   removal. Otherwise someone with `users.edit` would change the owner's
   *   password and keep the whole company. The owner uses
   *   `scripts/reset-password.ts`, which runs where the database is.
   * - **Their sessions are revoked.** Changing the password without deleting
   *   the refresh tokens leaves alive exactly the session being got rid of: the
   *   lost phone keeps getting in for another seven days.
   */
  async setPassword(companyId: string, memberId: string, password: string) {
    const member = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId },
    });
    if (!member) throw new NotFoundException('Member not found');

    if (member.isOwner) {
      throw new ForbiddenException(
        'La contraseña del propietario no se cambia desde aquí. Use scripts/reset-password.ts.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: member.userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: member.userId } }),
    ]);

    return { success: true };
  }

  async removeMember(companyId: string, memberId: string) {
    const member = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId },
    });
    if (!member) throw new NotFoundException('Member not found');

    if (member.isOwner) {
      throw new ForbiddenException('Cannot remove the company owner');
    }

    await this.prisma.companyMember.delete({ where: { id: memberId } });
    return { success: true };
  }
}
