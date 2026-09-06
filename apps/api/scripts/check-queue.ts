/**
 * Verifies that several receipts sent at once queue up instead of overwriting
 * each other, and that the bot answers once for the whole batch.
 *
 * The old behaviour cancelled the previous draft on every new receipt, so
 * sending five screenshots silently discarded four.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-queue.ts <companyId>
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReceiptIntakeService } from '../src/modules/assistant/receipt-intake.service';
import { ReceiptQueueService } from '../src/modules/assistant/queue/receipt-queue.service';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { DraftService } from '../src/modules/assistant/drafts/draft.service';
import { targetCompany } from './lib/test-company';

const FIXTURES = join(process.cwd(), 'test', 'fixtures');
const CHANNEL = 'check-queue';
const USER = 'ZZ-QUEUE';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  // Por defecto la empresa de pruebas. Un companyId por argumento sigue
  // sirviendo para reproducir algo contra datos reales.
  const companyId = await targetCompany(app, process.argv[2]);
  const prisma = app.get(PrismaService);
  const intake = app.get(ReceiptIntakeService);
  const queue = app.get(ReceiptQueueService);
  const assistant = app.get(AssistantService);
  const drafts = app.get(DraftService);

  let disposableProductId: string | null = null;
  const disposableEntryIds: string[] = [];

  try {
    await prisma.botDraft.deleteMany({ where: { channel: CHANNEL } });

    console.log('\n1. Dos comprobantes seguidos');

    const outcomes = [];
    for (const file of ['receipt-cobro-bdv-light.jpeg', 'receipt-pago-bdv-dark.jpeg']) {
      const result = await intake.intake({
        companyId,
        channel: CHANNEL,
        externalUserId: USER,
        image: readFileSync(join(FIXTURES, file)),
      });
      outcomes.push(result.outcome);
    }

    check('los dos entran a la cola', outcomes.every((o) => o.kind === 'queued'), JSON.stringify(outcomes.map((o) => o.kind)));

    const pending = await drafts.listPending(CHANNEL, USER);
    check('ninguno canceló al anterior', pending.length === 2, `${pending.length} pendientes`);

    console.log('\n2. Una sola respuesta para todo el lote');

    const batchReply = await queue.summarizeBatch(CHANNEL, USER, outcomes);
    check('hay respuesta', batchReply !== null);
    check('dice cuántos recibió', batchReply?.text.includes('Recibí 2 comprobantes') === true);
    check('numera el primero', batchReply?.text.includes('1 de 2') === true);
    check('trae botones del primero', (batchReply?.buttons?.length ?? 0) > 0);

    console.log('\n   Lo que vería el usuario:\n');
    console.log(batchReply!.text.split('\n').map((l) => `     ${l}`).join('\n'));
    console.log(`     [${batchReply!.buttons?.map((b) => b.title).join('] [')}]`);

    console.log('\n3. Resolver uno muestra el siguiente en el mismo mensaje');

    const cancelButton = batchReply!.buttons!.find((b) => b.id.startsWith('cx:'))!;
    const afterCancel = await assistant.handleButton(cancelButton.id, companyId, CHANNEL, USER);
    check('acusa el descarte', afterCancel?.text.includes('descarté') === true);
    check('y encadena el siguiente', afterCancel?.text.includes('SALIDA') === true, afterCancel?.text.slice(0, 80));
    check('con sus propios botones', (afterCancel?.buttons?.length ?? 0) > 0);
    check(
      'el siguiente ya no lleva contador',
      afterCancel?.text.includes('de 2') === false,
      'queda uno solo, no debería numerarse',
    );

    console.log('\n4. Consultar pendientes');

    const stillPending = await drafts.countPending(CHANNEL, USER);
    check('queda uno pendiente', stillPending === 1, String(stillPending));

    const pendingView = await assistant.showPending(CHANNEL, USER);
    check('lo muestra al pedirlo', pendingView.text.includes('SALIDA'));

    const lastButton = pendingView.buttons!.find((b) => b.id.startsWith('cx:'))!;
    await assistant.handleButton(lastButton.id, companyId, CHANNEL, USER);

    const emptyView = await assistant.showPending(CHANNEL, USER);
    check('con la cola vacía lo dice', emptyView.text.includes('No tienes comprobantes pendientes'));

    console.log('\n5. Un solo comprobante no lleva conteo');
    const single = await intake.intake({
      companyId,
      channel: CHANNEL,
      externalUserId: `${USER}-solo`,
      image: readFileSync(join(FIXTURES, 'receipt-cobro-bdv-light.jpeg')),
    });
    const singleReply = await queue.summarizeBatch(CHANNEL, `${USER}-solo`, [single.outcome]);
    check('sin encabezado de lote', singleReply?.text.includes('Recibí') === false);
    check('sin contador', singleReply?.text.includes('Comprobante 1 de') === false);

    console.log('\n6. El pago cae en lo que se acaba de registrar');

    // Registrar una compra y mandar su captura es un acto partido en dos
    // mensajes, y las cifras casi nunca calzan al bolívar. Sin la recencia, la
    // compra de hace dos minutos quedaba escondida detrás de "Pagar una compra"
    // junto a todas las viejas.
    const unit = await prisma.measurementUnit.findFirstOrThrow({ where: { companyId } });
    const category = await prisma.productCategoryConfig.findFirstOrThrow({ where: { companyId } });
    disposableProductId = (
      await prisma.product.create({
        data: {
          companyId,
          name: 'ZZ-QUEUE Insumo',
          categoryId: category.id,
          unitId: unit.id,
          currentStock: 0,
          minStock: 0,
        },
      })
    ).id;

    // Tres viejas, no una: a la única que sobra el formateador ya le daba botón
    // propio desde antes, así que con una sola el test pasaría sin que la
    // recencia existiera. Con tres tienen que colapsar en el selector.
    const older = await Promise.all(
      [222222.22, 333333.33, 444444.44].map((totalCost, index) =>
        prisma.productEntry.create({
          data: {
            companyId,
            code: `ZZ-QUEUE-VIEJA-${index}`,
            productId: disposableProductId!,
            quantity: 1,
            totalCost,
            status: 'received',
            paymentStatus: 'pending',
            createdAt: new Date(Date.now() - 6 * 60 * 60_000),
          },
        }),
      ),
    );
    const recent = await prisma.productEntry.create({
      data: {
        companyId,
        code: 'ZZ-QUEUE-NUEVA',
        productId: disposableProductId,
        quantity: 1,
        totalCost: 111111.11,
        status: 'received',
        paymentStatus: 'pending',
      },
    });
    disposableEntryIds.push(...older.map((one) => one.id), recent.id);

    const outgoing = await intake.intake({
      companyId,
      channel: CHANNEL,
      externalUserId: `${USER}-reciente`,
      image: readFileSync(join(FIXTURES, 'receipt-pago-bdv-dark.jpeg')),
    });

    const offered = outgoing.reply.buttons ?? [];
    const first = offered[0];
    check(
      'la compra recién registrada encabeza las opciones',
      first?.id.includes(recent.id) === true,
      offered.map((b) => b.title).join(' | '),
    );
    check(
      'y se dice por qué está ahí',
      first?.description?.includes('recién registrada') === true,
      first?.description,
    );
    check(
      'aunque el monto del comprobante no calce con su saldo',
      Number(outgoing.receipt.fields.amount ?? 0) !== 111111.11,
      String(outgoing.receipt.fields.amount),
    );
    check(
      'las viejas no se cuelan arriba',
      !offered.some((button) => older.some((one) => button.id.includes(one.id))),
      offered.map((b) => b.title).join(' | '),
    );
    check(
      'pero siguen a un toque de distancia',
      offered.some((b) => b.id.startsWith('pyl:')),
      offered.map((b) => b.title).join(' | '),
    );
  } finally {
    console.log('\nLimpiando...');
    await prisma.botDraft.deleteMany({ where: { channel: CHANNEL } });
    if (disposableEntryIds.length > 0) {
      await prisma.productEntry.deleteMany({ where: { id: { in: disposableEntryIds } } });
    }
    if (disposableProductId) {
      await prisma.product.deleteMany({ where: { id: disposableProductId } });
    }
    await app.close();
  }

  console.log(failures === 0 ? '\nTodo en verde.\n' : `\n${failures} verificación(es) fallaron.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
