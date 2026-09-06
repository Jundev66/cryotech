import type { INestApplicationContext } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WarehousesService } from '../../src/modules/warehouses/warehouses.service';
import { BatchesService } from '../../src/modules/batches/batches.service';
import { ClientsService } from '../../src/modules/clients/clients.service';
import { SalesService } from '../../src/modules/sales/sales.service';

const CLIENT_NAME = 'ZZ Cliente Deudor';
const WAREHOUSE_NAME = 'ZZ Galpón';
const BREED = 'ZZ Lote Cobrar';

/**
 * A client with exactly one pending sale, for the "Cobrar" search suite.
 *
 * Created once and reused, same as the test company itself (see its own
 * comment): a run that paid this sale off would make the next run create a
 * second one, so nothing in this suite may ever apply a payment to it.
 */
export async function resolveTestDebtor(
  app: INestApplicationContext,
  companyId: string,
): Promise<{ clientId: string; clientName: string }> {
  const prisma = app.get(PrismaService);

  const client =
    (await prisma.client.findFirst({ where: { companyId, name: CLIENT_NAME } })) ??
    (await app.get(ClientsService).create(companyId, { name: CLIENT_NAME } as never));

  const hasPendingSale = await prisma.sale.findFirst({
    where: { companyId, clientId: client.id, paymentStatus: { in: ['pending', 'partial'] } },
    select: { id: true },
  });
  if (hasPendingSale) return { clientId: client.id, clientName: CLIENT_NAME };

  const warehouse =
    (await prisma.warehouse.findFirst({ where: { companyId, name: WAREHOUSE_NAME } })) ??
    (await app.get(WarehousesService).create(companyId, { name: WAREHOUSE_NAME } as never));

  const batches = app.get(BatchesService);
  let batch = await prisma.batch.findFirst({ where: { companyId, breed: BREED } });
  if (!batch) {
    batch = await batches.create(companyId, {
      warehouseId: warehouse.id,
      breed: BREED,
      startDate: new Date().toISOString(),
      initialQuantity: 20,
    } as never);
    await batches.updateStatus(companyId, batch.id, 'breeding');
  }

  await app.get(SalesService).create(companyId, {
    batchId: batch.id,
    clientId: client.id,
    saleType: 'live',
    quantity: 5,
    weightKg: 10,
    pricePerKg: 4,
    totalAmount: 40,
  } as never);

  return { clientId: client.id, clientName: CLIENT_NAME };
}
