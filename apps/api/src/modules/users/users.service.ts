import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, data: { fullName?: string; phone?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { fullName: data.fullName || null, phone: data.phone || null },
      select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true },
    });
  }
}
