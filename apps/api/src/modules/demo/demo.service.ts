import { Injectable, Logger } from '@nestjs/common';
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
          address: 'Carretera Nacional, Sector El Rosal, Galpón Demo',
          isDemo: true,
          expiresAt,
        },
      });

      // 4. Crear rol de Administrador Demo
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

      // 6. Sembrar Unidades de Medida y Categorías
      const unitKg = await tx.measurementUnit.create({
        data: { companyId: company.id, name: 'Kilogramos', abbreviation: 'kg' },
      });
      const unitUnid = await tx.measurementUnit.create({
        data: { companyId: company.id, name: 'Unidades', abbreviation: 'unid' },
      });
      const unitLitro = await tx.measurementUnit.create({
        data: { companyId: company.id, name: 'Litros', abbreviation: 'L' },
      });
      await tx.measurementUnit.create({
        data: { companyId: company.id, name: 'Sacos 50kg', abbreviation: 'saco' },
      });

      const catFeed = await tx.productCategoryConfig.create({
        data: { companyId: company.id, name: 'Alimento Balanceado', slug: 'feed' },
      });
      await tx.productCategoryConfig.create({
        data: { companyId: company.id, name: 'Pollos Bebé', slug: 'chicks' },
      });
      const catVaccine = await tx.productCategoryConfig.create({
        data: { companyId: company.id, name: 'Vacunas y Medicinas', slug: 'vaccine' },
      });
      const catSupp = await tx.productCategoryConfig.create({
        data: { companyId: company.id, name: 'Suplementos y Vitaminas', slug: 'supplement' },
      });
      const catEquip = await tx.productCategoryConfig.create({
        data: { companyId: company.id, name: 'Equipos y Herramientas', slug: 'equipment' },
      });

      // 7. Productos del Inventario
      const prodIniciador = await tx.product.create({
        data: {
          companyId: company.id,
          code: 'ALM-001',
          name: 'Alimento Iniciador Pollito (Harina)',
          categoryId: catFeed.id,
          unitId: unitKg.id,
          currentStock: 4850,
          minStock: 1000,
        },
      });

      const prodEngorde = await tx.product.create({
        data: {
          companyId: company.id,
          code: 'ALM-002',
          name: 'Alimento Engorde Financiador (Peletizado)',
          categoryId: catFeed.id,
          unitId: unitKg.id,
          currentStock: 9200,
          minStock: 2000,
        },
      });

      await tx.product.create({
        data: {
          companyId: company.id,
          code: 'MED-001',
          name: 'Vacuna Newcastle + Gumboro (1000 dosis)',
          categoryId: catVaccine.id,
          unitId: unitUnid.id,
          currentStock: 12,
          minStock: 3,
        },
      });

      await tx.product.create({
        data: {
          companyId: company.id,
          code: 'SUP-001',
          name: 'Complejo Vitamínico ADE + Electrolitos',
          categoryId: catSupp.id,
          unitId: unitLitro.id,
          currentStock: 35,
          minStock: 10,
        },
      });

      await tx.product.create({
        data: {
          companyId: company.id,
          code: 'EQP-001',
          name: 'Comederos Tolva 12kg Antidesperdicio',
          categoryId: catEquip.id,
          unitId: unitUnid.id,
          productType: 'equipment',
          currentStock: 60,
          minStock: 15,
        },
      });

      // 8. Cuentas de Tesorería
      const accBanesco = await tx.account.create({
        data: {
          companyId: company.id,
          code: 'CTA-001',
          name: 'Banesco Banco Universal (Corriente)',
          kind: 'bank',
          currency: 'VES',
          currentBalance: 425000.00,
        },
      });

      await tx.account.create({
        data: {
          companyId: company.id,
          code: 'CTA-002',
          name: 'Banco Mercantil (Operaciones)',
          kind: 'bank',
          currency: 'VES',
          currentBalance: 290000.00,
        },
      });

      const accCajaUsd = await tx.account.create({
        data: {
          companyId: company.id,
          code: 'CTA-003',
          name: 'Caja Chica Efectivo Divisas',
          kind: 'cash',
          currency: 'USD',
          currentBalance: 3650.00,
        },
      });

      // 9. Galpones
      const warehouse1 = await tx.warehouse.create({
        data: {
          companyId: company.id,
          code: 'GAL-001',
          name: 'Galpón 1 (Túnel Climatizado)',
          capacity: 5000,
          location: 'Sector Norte - Fila A',
          isMain: true,
        },
      });

      const warehouse2 = await tx.warehouse.create({
        data: {
          companyId: company.id,
          code: 'GAL-002',
          name: 'Galpón 2 (Tradicional con Cortinas)',
          capacity: 3500,
          location: 'Sector Sur - Fila B',
        },
      });

      // 10. Clientes
      const client1 = await tx.client.create({
        data: { companyId: company.id, code: 'CLI-001', name: 'Distribuidora Mayorista El Corral', phone: '0414-1112233', email: 'compras@elcorral.com', address: 'Mercado Mayorista Galpón 4' },
      });
      const client2 = await tx.client.create({
        data: { companyId: company.id, code: 'CLI-002', name: 'Avícola & Frigorífico San José', phone: '0424-5556677', email: 'sanjose.avicola@gmail.com', address: 'Av. Principal Calle Comercio' },
      });
      const client3 = await tx.client.create({
        data: { companyId: company.id, code: 'CLI-003', name: 'Carnicería & Pollería La Central', phone: '0412-9998877', email: 'ventas@lacentral.com', address: 'Centro Comercial Los Llanos' },
      });
      await tx.client.create({
        data: { companyId: company.id, code: 'CLI-004', name: 'Restaurante Asador Criollo', phone: '0416-3334455', email: 'asadorcriollo@gmail.com', address: 'Autopista Km 12' },
      });

      const now = new Date();

      // 11. Lote 1: Activo en Cría (Cobb 500, 26 días de edad) en Galpón 1
      const batch1StartDate = new Date(now.getTime() - 26 * 24 * 60 * 60 * 1000);
      const batch1 = await tx.batch.create({
        data: {
          companyId: company.id,
          code: 'LOT-001',
          warehouseId: warehouse1.id,
          breed: 'Cobb 500',
          startDate: batch1StartDate,
          initialQuantity: 2500,
          currentQuantity: 2465,
          purchasePricePerUnit: 0.65,
          status: 'breeding',
          notes: 'Lote de alta conversión alimenticia, ambiente controlado y pesajes diarios estables.',
        },
      });

      // Generar 16 días consecutivos de registros diarios para Lote 1
      for (let day = 1; day <= 16; day++) {
        const logDate = new Date(batch1StartDate.getTime() + day * 24 * 60 * 60 * 1000);
        // Ganancia de peso progresiva Cobb 500
        const weightG = Math.round(45 + day * 55 + (day > 10 ? day * 25 : 0));
        const feedKg = Math.round((25 + day * 16) * 10) / 10;
        const waterL = Math.round(feedKg * 1.85);
        const mortality = day === 1 ? 5 : day === 3 ? 3 : day === 7 ? 2 : day === 12 ? 1 : 0;

        await tx.dailyLog.create({
          data: {
            companyId: company.id,
            batchId: batch1.id,
            logDate,
            mortality,
            averageWeightG: weightG,
            waterConsumedL: waterL,
            feedConsumedKg: feedKg,
            feedProductId: day <= 10 ? prodIniciador.id : prodEngorde.id,
            temperatureC: Math.round((32 - day * 0.35) * 10) / 10,
            humidityPct: 62 + (day % 4),
            healthScore: 94 + (day % 5),
            notes: day === 7 ? 'Vacunación Newcastle aplicada en agua de bebida' : null,
          },
        });
      }

      // 12. Lote 2: Listo para la Venta (Ross 308, 42 días) en Galpón 2
      const batch2StartDate = new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000);
      const batch2 = await tx.batch.create({
        data: {
          companyId: company.id,
          code: 'LOT-002',
          warehouseId: warehouse2.id,
          breed: 'Ross 308',
          startDate: batch2StartDate,
          initialQuantity: 3000,
          currentQuantity: 2680,
          purchasePricePerUnit: 0.68,
          status: 'for_sale',
          notes: 'Lote uniforme con peso promedio 2.48 kg, excelente conformación de pechuga listo para despacho.',
        },
      });

      // Últimos 7 registros diarios para Lote 2
      for (let i = 6; i >= 0; i--) {
        const logDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        await tx.dailyLog.create({
          data: {
            companyId: company.id,
            batchId: batch2.id,
            logDate,
            mortality: i === 5 ? 2 : i === 2 ? 1 : 0,
            averageWeightG: 2420 + (6 - i) * 20,
            waterConsumedL: 620,
            feedConsumedKg: 410,
            feedProductId: prodEngorde.id,
            temperatureC: 25.5,
            humidityPct: 68,
            healthScore: 96,
          },
        });
      }

      // 13. Lote 3: Finalizado Exitosamente (Cerrado hace 12 días)
      const batch3StartDate = new Date(now.getTime() - 55 * 24 * 60 * 60 * 1000);
      const batch3EndDate = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);
      const batch3 = await tx.batch.create({
        data: {
          companyId: company.id,
          code: 'LOT-003',
          warehouseId: warehouse1.id,
          breed: 'Cobb 500',
          startDate: batch3StartDate,
          endDate: batch3EndDate,
          initialQuantity: 2000,
          currentQuantity: 0,
          purchasePricePerUnit: 0.62,
          status: 'finished',
          notes: 'Ciclo cerrado exitosamente. Mortalidad acumulada 2.8%, FCR 1.58. 100% liquidado.',
        },
      });

      // 14. Compras de Insumos (Product Entries)
      // Entrada 1: Alimento Iniciador (Pagada total)
      const entry1 = await tx.productEntry.create({
        data: {
          companyId: company.id,
          code: 'ENT-001',
          productId: prodIniciador.id,
          batchId: batch1.id,
          quantity: 100, // sacos
          costPerUnit: 28.50,
          totalCost: 2850.00,
          deliveryCost: 50.00,
          status: 'received',
          supplierName: 'Agropecuaria El Maizal C.A.',
          paymentStatus: 'paid',
          paidAmount: 725000.00, // en Bs
          entryDate: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
          notes: '100 sacos de iniciador recibidos a conformidad',
        },
      });

      // Entrada 2: Alimento Engorde (Pago Parcial)
      await tx.productEntry.create({
        data: {
          companyId: company.id,
          code: 'ENT-002',
          productId: prodEngorde.id,
          batchId: batch2.id,
          quantity: 200, // sacos
          costPerUnit: 31.00,
          totalCost: 6200.00,
          deliveryCost: 80.00,
          status: 'received',
          supplierName: 'Nutrición Animal Los Andes',
          paymentStatus: 'partial',
          paidAmount: 785000.00, // en Bs (saldo restante pendiente)
          entryDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
          notes: 'Lote de 200 sacos engorde. Abono del 50% vía transferencia.',
        },
      });

      // Pagos de compras a proveedores
      await tx.payablePayment.create({
        data: {
          companyId: company.id,
          entryId: entry1.id,
          amount: 725000.00,
          amountUsd: 2900.00,
          exchangeRate: 250,
          accountId: accBanesco.id,
          reference: 'REF-BAN-9821',
          paymentDate: new Date(now.getTime() - 24 * 24 * 60 * 60 * 1000),
          notes: 'Pago total factura Alimentos El Maizal',
        },
      });

      // 15. Ventas de Demostración
      // Venta 1: Lote 2 a Mayorista El Corral (Cobrada de contado en USD efectivo)
      const sale1 = await tx.sale.create({
        data: {
          companyId: company.id,
          code: 'VEN-001',
          batchId: batch2.id,
          clientId: client1.id,
          saleType: 'live',
          quantity: 200,
          weightKg: 504.0,
          pricePerKg: 2.35,
          totalAmount: 1184.40,
          paidAmount: 1184.40,
          paymentStatus: 'paid',
          saleDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          notes: 'Despacho camión 1. 200 pollos vivos pesaje en granja.',
        },
      });

      await tx.salePayment.create({
        data: {
          companyId: company.id,
          saleId: sale1.id,
          accountId: accCajaUsd.id,
          amount: 1184.40,
          amountBs: 296100.00,
          exchangeRate: 250,
          paymentDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          notes: 'Pago completo de contado en divisas efectivo',
        },
      });

      await tx.transaction.create({
        data: {
          companyId: company.id,
          code: 'TRA-001',
          batchId: batch2.id,
          accountId: accCajaUsd.id,
          type: 'income',
          category: 'sale_live',
          amount: 296100.00,
          exchangeRate: 250,
          description: 'Cobro venta VEN-001: 200 pollos vivos a El Corral',
          sourceType: 'sale_payment',
          transactionDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        },
      });

      // Venta 2: Lote 2 a Carnicería La Central (Abono Parcial en Bs a Banesco)
      const sale2 = await tx.sale.create({
        data: {
          companyId: company.id,
          code: 'VEN-002',
          batchId: batch2.id,
          clientId: client3.id,
          saleType: 'live',
          quantity: 120,
          weightKg: 297.5,
          pricePerKg: 2.40,
          totalAmount: 714.00,
          paidAmount: 400.00,
          paymentStatus: 'partial',
          dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
          saleDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          notes: 'Abono inicial 400 USD en Bs. Saldo restante vence a 7 días.',
        },
      });

      await tx.salePayment.create({
        data: {
          companyId: company.id,
          saleId: sale2.id,
          accountId: accBanesco.id,
          amount: 400.00,
          amountBs: 100000.00,
          exchangeRate: 250,
          paymentDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          notes: 'Transferencia Banesco abono inicial',
        },
      });

      await tx.transaction.create({
        data: {
          companyId: company.id,
          code: 'TRA-002',
          batchId: batch2.id,
          accountId: accBanesco.id,
          type: 'income',
          category: 'sale_live',
          amount: 100000.00,
          exchangeRate: 250,
          description: 'Abono venta VEN-002: 120 pollos (La Central)',
          sourceType: 'sale_payment',
          transactionDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        },
      });

      // Venta 3: Histórica del Lote 3
      await tx.sale.create({
        data: {
          companyId: company.id,
          code: 'VEN-003',
          batchId: batch3.id,
          clientId: client2.id,
          saleType: 'live',
          quantity: 1930,
          weightKg: 4632.0,
          pricePerKg: 2.30,
          totalAmount: 10653.60,
          paidAmount: 10653.60,
          paymentStatus: 'paid',
          saleDate: batch3EndDate,
          notes: 'Venta final y liquidación total del lote 3.',
        },
      });

      // 16. Beneficio / Procesamiento de Aves
      await tx.processing.create({
        data: {
          companyId: company.id,
          code: 'BEN-001',
          batchId: batch2.id,
          quantity: 80,
          liveWeightKg: 198.4,
          processedWeightKg: 148.8, // 75% de rendimiento en canal
          isSelfProcessed: true,
          totalCost: 95.00,
          totalCostBs: 23750.00,
          exchangeRate: 250,
          paymentStatus: 'paid',
          paidAmount: 23750.00,
          processingDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
          notes: 'Beneficio de 80 aves de prueba para canal refrigerada. Rendimiento 75%.',
        },
      });

      // 17. Consumos de Insumos
      await tx.productConsumption.create({
        data: {
          companyId: company.id,
          batchId: batch1.id,
          productId: prodIniciador.id,
          quantity: 350,
          consumptionDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          notes: 'Consumo acumulado semana 2 de crianza galpón 1',
        },
      });

      await tx.productConsumption.create({
        data: {
          companyId: company.id,
          batchId: batch2.id,
          productId: prodEngorde.id,
          quantity: 800,
          consumptionDate: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
          notes: 'Consumo alimento engorde galpón 2 fase final',
        },
      });

      // 18. Movimientos de Cuenta adicionales
      await tx.accountMovement.create({
        data: {
          companyId: company.id,
          accountId: accCajaUsd.id,
          direction: 'in',
          amount: 1184.40,
          currency: 'USD',
          movementDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          reference: 'REC-001',
          counterparty: 'Distribuidora Mayorista El Corral',
          concept: 'Cobro venta de contado VEN-001',
        },
      });

      await tx.accountMovement.create({
        data: {
          companyId: company.id,
          accountId: accBanesco.id,
          direction: 'in',
          amount: 100000.00,
          currency: 'VES',
          movementDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          reference: 'REF-BAN-4819',
          counterparty: 'Carnicería & Pollería La Central',
          concept: 'Abono a cuenta por venta VEN-002',
        },
      });

      // 19. Generar tokens JWT para acceso inmediato
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
