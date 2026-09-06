/**
 * Verifies the WhatsApp forms end to end without Meta in the loop.
 *
 * Meta validates the layouts (that is what `publish.sh` does); this validates
 * everything on our side of the wire: that the catalog matches the published
 * JSON, that a form is populated with real options, that a submitted answer
 * becomes the right record, and that resending the same submission does not
 * register it twice.
 *
 * Creates everything it needs and removes it again.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-flows.ts <companyId>
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { FlowService } from '../src/modules/assistant/flows/flow.service';
import { FlowDataService } from '../src/modules/assistant/flows/flow-data.service';
import { FLOWS, type FlowKind } from '../src/modules/assistant/flows/flow.catalog';
import { WhatsappTransportService } from '../src/modules/whatsapp/whatsapp-transport.service';
import { targetCompany } from './lib/test-company';

const FLOW_DIR = join(process.cwd(), '..', '..', 'services', 'whatsapp-flows', 'flows');
const MARKER = 'ZZ-FLOW';
const CHANNEL = 'check-flows';
const USER = 'ZZ-FLOW-USER';

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
  const assistant = app.get(AssistantService);
  const flows = app.get(FlowService);
  const flowData = app.get(FlowDataService);
  const transport = app.get(WhatsappTransportService);

  const made = {
    warehouseId: null as string | null,
    batchId: null as string | null,
    clientId: null as string | null,
    saleIds: [] as string[],
    dailyLogIds: [] as string[],
  };

  try {
    console.log('\n1. Preparando lote y cliente desechables');

    const warehouse = await prisma.warehouse.create({
      data: { companyId, name: `${MARKER} Galpón`, capacity: 200 },
    });
    made.warehouseId = warehouse.id;

    const batch = await prisma.batch.create({
      data: {
        companyId,
        code: `${MARKER}-LOT`,
        warehouseId: warehouse.id,
        breed: 'Cobb 500',
        initialQuantity: 100,
        currentQuantity: 100,
        status: 'for_sale',
      },
    });
    made.batchId = batch.id;

    const client = await prisma.client.create({
      data: { companyId, code: `${MARKER}-CLI`, name: `${MARKER} Comprador` },
    });
    made.clientId = client.id;

    console.log('\n2. El catálogo coincide con los formularios publicados');

    for (const [kind, meta] of Object.entries(FLOWS)) {
      const path = join(FLOW_DIR, `${meta.file}.json`);
      let doc: { screens?: Array<{ id?: string; terminal?: boolean; data?: Record<string, unknown> }> };
      try {
        doc = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        check(`${kind}: el JSON existe`, false, path);
        continue;
      }

      const screen = doc.screens?.[0];
      check(`${kind}: la pantalla se llama ${meta.screen}`, screen?.id === meta.screen, screen?.id);
      check(`${kind}: es terminal`, screen?.terminal === true);

      // Every property the screen declares has to be sent, or the form opens
      // with an empty dropdown and no way to tell why.
      const declared = Object.keys(screen?.data ?? {});
      const payload = await flowData.build(companyId, kind as FlowKind);
      if (payload.blocked) {
        console.log(`       (${kind} no se puede abrir ahora: ${payload.blocked})`);
        continue;
      }
      const missing = declared.filter((key) => !(key in payload.data));
      check(`${kind}: se envían los ${declared.length} datos que pide`, missing.length === 0, missing.join(', '));

      const extra = Object.keys(payload.data).filter((key) => !declared.includes(key));
      check(`${kind}: no se envía nada de más`, extra.length === 0, extra.join(', '));
    }

    // Nothing to open without a published form, and that is an environment
    // condition, not a failure: Meta does not release Flows to a business with
    // no legal registration (services/whatsapp-flows/README.md). The catalog
    // checks above run either way.
    if (!flows.isAvailable('sale')) {
      console.log('\n   Formularios no configurados: falta WHATSAPP_FLOWS_ENABLED=true');
      console.log('   o WHATSAPP_FLOW_IDS. Los pasos 3 a 8 necesitan uno publicado en Meta.');
      return;
    }

    console.log('\n3. Abrir el formulario de venta');

    const opened = await flows.open(companyId, 'sale', CHANNEL, USER);
    check('devuelve un formulario, no texto', Boolean(opened.flow), opened.text);
    check('apunta a la pantalla SALE', opened.flow?.screen === 'SALE');
    check('trae un token de correlación', Boolean(opened.flow?.flowToken));

    const clients = (opened.flow?.data.clients ?? []) as Array<{ id: string }>;
    const batches = (opened.flow?.data.batches ?? []) as Array<{ id: string }>;
    check('el cliente desechable está en la lista', clients.some((c) => c.id === client.id));
    check('el lote desechable está en la lista', batches.some((b) => b.id === batch.id));
    check(
      'el calendario no deja fechas futuras',
      String(opened.flow?.data.max_date) <= new Date().toISOString().slice(0, 10),
      String(opened.flow?.data.max_date),
    );

    console.log('\n4. Enviar la respuesta como la manda WhatsApp');

    const token = opened.flow!.flowToken;
    const incoming = await transport.toIncoming({
      id: 'wamid.ZZ-FLOW-1',
      from: USER,
      type: 'interactive',
      interactive: {
        type: 'nfm_reply',
        nfm_reply: {
          response_json: JSON.stringify({
            flow_token: token,
            client: client.id,
            batch: batch.id,
            sale_type: 'live',
            quantity: '10',
            weight_kg: '22,5',
            price_per_kg: '4',
            sale_date: new Date().toISOString().slice(0, 10),
            payment: 'pending',
          }),
        },
      },
    });

    check('el transporte lo reconoce como formulario', incoming?.kind === 'flow_reply', incoming?.kind);
    check('extrae el token', incoming?.flowReply?.flowToken === token);
    check('el token no viaja entre las respuestas', !('flow_token' in (incoming?.flowReply?.submission ?? {})));

    const reply = await assistant.handleFlowReply(token, incoming!.flowReply!.submission);
    check('responde con un acuse', reply?.text.includes('✅') === true, reply?.text);

    const sale = await prisma.sale.findFirst({
      where: { companyId, batchId: batch.id, clientId: client.id },
      orderBy: { createdAt: 'desc' },
    });
    if (sale) made.saleIds.push(sale.id);
    check('creó la venta', Boolean(sale));
    check('con el tipo elegido', sale?.saleType === 'live', sale?.saleType);
    check('con los kilos leídos en formato local', Number(sale?.weightKg) === 22.5, String(sale?.weightKg));
    check('con el total calculado', Number(sale?.totalAmount) === 90, String(sale?.totalAmount));
    check('queda fiada', sale?.paymentStatus === 'pending', sale?.paymentStatus);
    check('tiene código de secuencia', Boolean(sale?.code), sale?.code ?? '');

    console.log('\n5. Reenviar la misma respuesta no registra dos veces');

    const replay = await assistant.handleFlowReply(token, incoming!.flowReply!.submission);
    check('el reenvío no dice nada', replay === null, replay?.text);
    const saleCount = await prisma.sale.count({ where: { companyId, batchId: batch.id } });
    check('sigue habiendo una sola venta', saleCount === 1, String(saleCount));

    console.log('\n6. Una respuesta con datos inválidos no rompe nada');

    const second = await flows.open(companyId, 'sale', CHANNEL, USER);
    const badReply = await assistant.handleFlowReply(second.flow!.flowToken, {
      client: client.id,
      batch: '00000000-0000-0000-0000-000000000000',
      sale_type: 'live',
      quantity: '1',
      weight_kg: '1',
      price_per_kg: '4',
      sale_date: new Date().toISOString().slice(0, 10),
      payment: 'paid',
    });
    check('rechaza un lote que nunca se ofreció', badReply?.text.includes('⚠️') === true, badReply?.text);
    check('no creó una segunda venta', (await prisma.sale.count({ where: { companyId, batchId: batch.id } })) === 1);

    const failed = await prisma.botFlowSession.findUnique({
      where: { flowToken: second.flow!.flowToken },
    });
    check('el formulario vuelve a quedar disponible', failed?.status === 'pending', failed?.status);

    console.log('\n7. Un token desconocido se ignora en silencio');
    const unknown = await assistant.handleFlowReply('no-existe', {});
    check('no responde nada', unknown === null);

    console.log('\n8. Registro diario por formulario');

    await prisma.batch.update({ where: { id: batch.id }, data: { status: 'breeding' } });
    const logForm = await flows.open(companyId, 'daily_log', CHANNEL, USER);
    check('el formulario del día se abre', Boolean(logForm.flow), logForm.text);

    const logReply = await assistant.handleFlowReply(logForm.flow!.flowToken, {
      batch: batch.id,
      log_date: new Date().toISOString().slice(0, 10),
      mortality: '3',
      feed_consumed_kg: '12,5',
      average_weight_g: '',
      water_consumed_l: '',
    });
    check('responde con un acuse', logReply?.text.includes('✅') === true, logReply?.text);

    const log = await prisma.dailyLog.findFirst({ where: { batchId: batch.id } });
    if (log) made.dailyLogIds.push(log.id);
    check('guardó la mortalidad', log?.mortality === 3, String(log?.mortality));
    check('guardó el alimento en formato local', Number(log?.feedConsumedKg) === 12.5, String(log?.feedConsumedKg));
    check('dejó vacío lo que no se llenó', log?.averageWeightG === null, String(log?.averageWeightG));
  } finally {
    console.log('\nLimpiando...');
    await prisma.botFlowSession.deleteMany({ where: { channel: CHANNEL } });
    if (made.batchId) {
      await prisma.dailyLog.deleteMany({ where: { batchId: made.batchId } });
      await prisma.salePayment.deleteMany({ where: { saleId: { in: made.saleIds } } });
      await prisma.sale.deleteMany({ where: { batchId: made.batchId } });
      await prisma.transaction.deleteMany({ where: { batchId: made.batchId } });
      await prisma.batch.deleteMany({ where: { id: made.batchId } });
    }
    if (made.clientId) await prisma.client.deleteMany({ where: { id: made.clientId } });
    if (made.warehouseId) await prisma.warehouse.deleteMany({ where: { id: made.warehouseId } });
    await app.close();
  }

  if (failures === 0) console.log('\nTodo en verde.');
  else {
    console.log(`\n${failures} verificación(es) fallaron.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
