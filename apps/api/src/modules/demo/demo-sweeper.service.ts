import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DemoSweeperService {
  private readonly logger = new Logger(DemoSweeperService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Purgado automático de empresas demo expiradas.
   * Se ejecuta cada 30 minutos y borra en cascada todas las empresas demo
   * cuya fecha de expiración haya sido superada.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async purgeExpiredDemos(): Promise<void> {
    try {
      const now = new Date();
      const expiredCompanies = await this.prisma.company.findMany({
        where: {
          isDemo: true,
          expiresAt: { lte: now },
        },
        select: { id: true, name: true },
      });

      if (expiredCompanies.length === 0) return;

      this.logger.log(`Iniciando purga de ${expiredCompanies.length} empresa(s) demo expirada(s)...`);

      const deleted = await this.prisma.company.deleteMany({
        where: {
          id: { in: expiredCompanies.map((c) => c.id) },
        },
      });

      // Limpiar usuarios demo huérfanos que ya no son dueños de ninguna empresa
      const orphanedUsers = await this.prisma.user.findMany({
        where: {
          email: { endsWith: '@cryotech.demo' },
          ownedCompanies: { none: {} },
        },
        select: { id: true },
      });

      if (orphanedUsers.length > 0) {
        await this.prisma.user.deleteMany({
          where: { id: { in: orphanedUsers.map((u) => u.id) } },
        });
      }

      this.logger.log(`Purga completada: ${deleted.count} empresa(s) demo y ${orphanedUsers.length} usuario(s) eliminados.`);
    } catch (error) {
      this.logger.error(`Error durante la purga de empresas demo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
