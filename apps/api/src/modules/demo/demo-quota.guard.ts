import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_DEMO_MUTATIONS = 10;

@Injectable()
export class DemoQuotaGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const method = request.method?.toUpperCase();

    // Solo protegemos mutaciones (POST, PATCH, PUT, DELETE); lecturas (GET) son siempre ilimitadas
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return true;
    }

    const companyId = request.companyId;
    if (!companyId) return true;

    // Verificar si la empresa actual es Demo
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { isDemo: true, expiresAt: true },
    });

    if (!company || !company.isDemo) {
      return true;
    }

    // Si la demo ya expiró
    if (company.expiresAt && company.expiresAt < new Date()) {
      throw new ForbiddenException(
        'Esta sesión de demostración ha expirado. Por favor, inicia una nueva demo o crea tu cuenta.',
      );
    }

    const url = request.originalUrl || request.url || '';

    // Bloqueo estricto de ciberseguridad: una empresa demo NUNCA puede tocar usuarios ni membresías
    if (url.includes('/members') || url.includes('/roles') || url.includes('/users')) {
      throw new ForbiddenException(
        'La gestión de usuarios y roles está deshabilitada en la versión de demostración.',
      );
    }

    // Contar las mutaciones realizadas por esta empresa demo
    const [salesCount, dailyLogsCount, batchesCount, entriesCount] = await Promise.all([
      this.prisma.sale.count({ where: { companyId } }),
      this.prisma.dailyLog.count({ where: { companyId } }),
      this.prisma.batch.count({ where: { companyId } }),
      this.prisma.productEntry.count({ where: { companyId } }),
    ]);

    // La semilla inicial tiene 2 ventas, 4 logs, 1 batch = 7 registros base.
    // Permitimos hasta 10 mutaciones adicionales sobre la base.
    const totalRecords = salesCount + dailyLogsCount + batchesCount + entriesCount;
    const BASE_RECORDS = 7;

    if (totalRecords - BASE_RECORDS >= MAX_DEMO_MUTATIONS) {
      throw new ForbiddenException(
        'Has alcanzado el límite de 10 operaciones de la demostración. Crea tu cuenta real para gestionar tu granja completa.',
      );
    }

    return true;
  }
}
