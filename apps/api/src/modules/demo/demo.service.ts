import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementUnitsService } from '../measurement-units/measurement-units.service';
import { ProductCategoriesService } from '../product-categories/product-categories.service';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

const DEMO_LIFETIME_HOURS = 2;
const MAX_CONCURRENT_DEMOS = 30;
const REFRESH_TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly measurementUnits: MeasurementUnitsService,
    private readonly productCategories: ProductCategoriesService,
  ) {}

  /**
   * Crea una empresa efímera aislada con dataset semilla completo y tokens de acceso directo.
   */
  async createDemoSession() {
    // 1. Candado de seguridad: Límite global de empresas demo concurrentes
    const activeDemoCount = await this.prisma.company.count({
      where: { isDemo: true },
    });

    if (activeDemoCount >= MAX_CONCURRENT_DEMOS) {
      // Purgar inmediatamente las empresas demo más antiguas para no saturar la base
      const oldestDemos = await this.prisma.company.findMany({
        where: { isDemo: true },
        orderBy: { createdAt: 'asc' },
        take: activeDemoCount - MAX_CONCURRENT_DEMOS + 5,
        select: { id: true },
      });
      if (oldestDemos.length > 0) {
        await this.prisma.company.deleteMany({
          where: { id: { in: oldestDemos.map((d) => d.id) } },
        });
      }
    }

    const uniqueTag = Math.floor(1000 + Math.random() * 9000);
    const demoEmail = `demo-${randomUUID().slice(0, 8)}@cryotech.demo`;
    const randomPassword = randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const expiresAt = new Date(Date.now() + DEMO_LIFETIME_HOURS * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      // 2. Crear usuario efímero demo
      const user = await tx.user.create({
        data: {
          email: demoEmail,
          passwordHash,
          fullName: `Productor Demo #${uniqueTag}`,
        },
      });

      // 3. Crear empresa efímera demo
      const company = await tx.company.create({
        data: {
          ownerId: user.id,
          name: `Granja Demo #${uniqueTag}`,
          phone: '+58 412 0000000',
          address: 'Sector Agrícola Los Llanos, Lote Demo',
          isDemo: true,
          expiresAt,
        },
      });

      // 4. Crear rol de Administrador Demo (restringido en gestión de usuarios)
      const adminRole = await tx.role.create({
        data: {
          companyId: company.id,
          name: 'Administrador Demo',
          permissions: {
            batches: { view: true, create: true, edit: true, delete: false },
            daily_logs: { view: true, create: true, edit: true, delete: false },
            sales: { view: true, create: true, edit: true, delete: false },
            entries: { view: true, create: true, edit: true, delete: false },
            treasury: { view: true, create: true, edit: true, delete: false },
            processing: { view: true, create: true, edit: true, delete: false },
            clients: { view: true, create: true, edit: true, delete: false },
            products: { view: true, create: true, edit: true, delete: false },
            warehouses: { view: true, create: true, edit: true, delete: false },
            feed: { view: true, create: true, edit: true, delete: false },
            reports: { view: true },
            settings: { view: true, edit: false },
            users: { view: true, create: false, edit: false, delete: false },
          },
        },
      });

      // 5. Vincular usuario a la empresa como Owner
      await tx.companyMember.create({
        data: {
          companyId: company.id,
          userId: user.id,
          roleId: adminRole.id,
          isOwner: true,
        },
      });

      // 6. Galpón Demo
      const warehouse = await tx.warehouse.create({
        data: {
          companyId: company.id,
          code: 'GAL-001',
          name: 'Galpón 1 (Climatizado)',
          capacity: 5000,
          location: 'Sector Norte',
        },
      });

      // 7. Lote Demo activo (con 28 días de crianza)
      const now = new Date();
      const startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

      const batch = await tx.batch.create({
        data: {
          companyId: company.id,
          code: 'LOT-001',
          warehouseId: warehouse.id,
          breed: 'Cobb 500',
          startDate,
          initialQuantity: 2500,
          currentQuantity: 2465,
          purchasePricePerUnit: 0.65,
          status: 'breeding',
          notes: 'Lote de demostración con excelente conversión alimenticia',
        },
      });

      // 8. Clientes Demo
      const client1 = await tx.client.create({
        data: { companyId: company.id, code: 'CLI-001', name: 'Distribuidora El Corral', phone: '0414-1112233', address: 'Mercado Mayorista' },
      });
      const client2 = await tx.client.create({
        data: { companyId: company.id, code: 'CLI-002', name: 'Avícola San José', phone: '0424-5556677', address: 'Av. Principal Local 4' },
      });
      const client3 = await tx.client.create({
        data: { companyId: company.id, code: 'CLI-003', name: 'Carnicería La Central', phone: '0412-9998877', address: 'Centro Comercial' },
      });

      // 9. Registros Diarios de los últimos 4 días
      const dailyLogDays = [
        { dayOffset: 3, mortality: 4, weight: 1450, water: 420, feed: 290 },
        { dayOffset: 2, mortality: 2, weight: 1520, water: 440, feed: 305 },
        { dayOffset: 1, mortality: 3, weight: 1600, water: 460, feed: 320 },
        { dayOffset: 0, mortality: 1, weight: 1680, water: 475, feed: 335 },
      ];

      for (const log of dailyLogDays) {
        const logDate = new Date(now.getTime() - log.dayOffset * 24 * 60 * 60 * 1000);
        await tx.dailyLog.create({
          data: {
            companyId: company.id,
            batchId: batch.id,
            logDate,
            mortality: log.mortality,
            averageWeightG: log.weight,
            waterConsumedL: log.water,
            feedConsumedKg: log.feed,
            temperatureC: 27.5,
            humidityPct: 65,
            healthScore: 95,
          },
        });
      }

      // 10. Ventas de Demostración
      // Venta 1: Pagada
      const sale1 = await tx.sale.create({
        data: {
          companyId: company.id,
          code: 'VEN-001',
          batchId: batch.id,
          clientId: client1.id,
          saleType: 'live',
          quantity: 200,
          weightKg: 420.5,
          pricePerKg: 2.30,
          totalAmount: 967.15,
          paidAmount: 967.15,
          paymentStatus: 'paid',
          saleDate: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.salePayment.create({
        data: {
          companyId: company.id,
          saleId: sale1.id,
          amount: 967.15,
          amountBs: 241787.50,
          exchangeRate: 250,
          paymentDate: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
          notes: 'Pago completo de contado',
        },
      });

      await tx.transaction.create({
        data: {
          companyId: company.id,
          code: 'TRA-001',
          batchId: batch.id,
          type: 'income',
          category: 'sale_live',
          amount: 241787.50,
          exchangeRate: 250,
          description: 'Cobro de venta: 200 pollos (vivos)',
          sourceType: 'sale_payment',
          transactionDate: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
        },
      });

      // Venta 2: Parcial / Pendiente
      await tx.sale.create({
        data: {
          companyId: company.id,
          code: 'VEN-002',
          batchId: batch.id,
          clientId: client2.id,
          saleType: 'live',
          quantity: 150,
          weightKg: 315.0,
          pricePerKg: 2.35,
          totalAmount: 740.25,
          paidAmount: 300.00,
          paymentStatus: 'partial',
          saleDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
          dueDate: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
          notes: 'Abono inicial 300$, saldo a 7 días',
        },
      });

      // 11. Generar tokens JWT para acceso inmediato
      const payload = { sub: user.id, email: user.email };
      const accessToken = this.jwt.sign(payload);
      const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
      const familyId = randomUUID();

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          familyId,
          expiresAt,
        },
      });

      return {
        accessToken,
        refreshToken,
        expiresAt,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        company: {
          id: company.id,
          name: company.name,
          isDemo: true,
          expiresAt,
        },
      };
    });
  }
}
