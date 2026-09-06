/**
 * Drives the button wizard exactly as WhatsApp would: taps and typed answers.
 *
 * This is what actually registers operations from the phone — Meta will not
 * release native forms from an unregistered business — so it has to be at least
 * as trustworthy as the form was: nothing typed that could be tapped, no id
 * accepted that was never offered, and no operation registered twice.
 *
 * Creates everything it needs and removes it again.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-wizard.ts <companyId>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { WizardService } from '../src/modules/assistant/wizard/wizard.service';
import { WIZARDS } from '../src/modules/assistant/wizard/wizard.catalog';
import { MENU_OPERATIONS } from '../src/modules/assistant/menu/menu.catalog';
import {
  BUTTON,
  buildButtonId,
  type OutgoingMessage,
} from '../src/modules/assistant/types/assistant.types';
import { CHICKS_CATEGORY_SLUG } from '../src/common/constants/category-mapping';
import { targetCompany } from './lib/test-company';

const MARKER = 'ZZ-WIZ';
const CHANNEL = 'check-wizard';
const USER = 'ZZ-WIZ-USER';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** The option whose title matches, as the user would find it on screen. */
/** Los títulos de las filas, para que un fallo diga qué se ofreció de verdad. */
function titles(reply: OutgoingMessage | null): string {
  return reply?.buttons?.map((b) => b.title).join(' | ') ?? 'sin botones';
}

function find(reply: OutgoingMessage | null, match: string | RegExp) {
  return reply?.buttons?.find((b) =>
    typeof match === 'string' ? b.title.includes(match) : match.test(b.title),
  );
}

function pick(reply: OutgoingMessage | null, match: string | RegExp): string {
  const button = find(reply, match);
  if (!button) {
    throw new Error(
      `No hay opción "${match}" en: ${reply?.buttons?.map((b) => b.title).join(' | ') ?? 'sin botones'}`,
    );
  }
  return button.id;
}

/**
 * Taps "Ver más" until the option shows up, the way the user would.
 *
 * Granja Mata has 28 clients and a WhatsApp list holds ten rows, so reaching
 * most of them means paging. If this ever loops forever, the pager stopped
 * cycling and someone is stuck.
 */
async function pageUntil(
  reply: OutgoingMessage | null,
  match: string | RegExp,
  tap: (id: string) => Promise<OutgoingMessage | null>,
  maxPages = 12,
): Promise<{ reply: OutgoingMessage | null; pages: number }> {
  let current = reply;
  for (let pages = 1; pages <= maxPages; pages++) {
    if (find(current, match)) return { reply: current, pages };
    const more = find(current, 'Ver más');
    if (!more) break;
    current = await tap(more.id);
  }
  throw new Error(`No encontré "${match}" paginando ${maxPages} páginas`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  // Por defecto la empresa de pruebas. Un companyId por argumento sigue
  // sirviendo para reproducir algo contra datos reales.
  const companyId = await targetCompany(app, process.argv[2]);
  const prisma = app.get(PrismaService);
  const assistant = app.get(AssistantService);
  const wizard = app.get(WizardService);

  const tap = (id: string) => assistant.handleButton(id, companyId, CHANNEL, USER);
  const type = (text: string) => assistant.handleText(text, companyId, CHANNEL, USER);

  let restoreBirds: () => Promise<void> = async () => {};

  const made = {
    warehouseId: null as string | null,
    batchId: null as string | null,
    plannedBatchId: null as string | null,
    clientId: null as string | null,
    clientIds: [] as string[],
    productId: null as string | null,
    categoryId: null as string | null,
    chickProductIds: [] as string[],
    entryIds: [] as string[],
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

    // Doce clientes para que la lista tenga que paginar de verdad. Antes esto
    // funcionaba de casualidad porque la empresa real tiene veintiocho; en una
    // empresa de pruebas limpia no paginaba nada y el test no probaba nada.
    const filler = await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        prisma.client.create({
          data: { companyId, code: `${MARKER}-C${index}`, name: `${MARKER} Cliente ${index}` },
        }),
      ),
    );
    made.clientIds.push(...filler.map((one) => one.id));

    // El que busca el test va al final del alfabeto y sin deuda, así que cae en
    // la última página: justo el caso que era inalcanzable desde el teléfono.
    const client = await prisma.client.create({
      data: { companyId, code: `${MARKER}-CLI`, name: `${MARKER} Zulay Comprador` },
    });
    made.clientId = client.id;
    made.clientIds.push(client.id);

    // Un producto propio, para que comprar por WhatsApp no dependa del
    // catálogo de la granja real.
    const unit = await prisma.measurementUnit.findFirstOrThrow({ where: { companyId } });
    const category = await prisma.productCategoryConfig.create({
      data: { companyId, name: `${MARKER} Alimento`, slug: `${MARKER.toLowerCase()}-feed` },
    });
    made.categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        companyId,
        name: `${MARKER} Alimento Engorde`,
        categoryId: category.id,
        unitId: unit.id,
        currentStock: 0,
        minStock: 0,
      },
    });
    made.productId = product.id;

    // Dos pollitos, no uno: con un solo producto de la categoría el asistente
    // siembra la respuesta y no pregunta, así que la pregunta —y comprobar que
    // solo acepta lo que ofreció— solo se ejercita habiendo de dónde elegir.
    // La categoría no se borra al final: toda empresa debe tenerla —
    // `ProductCategoriesService` la siembra— y es de dónde sale que el gasto
    // caiga en `chicks` y no en `other`. Los productos sí son del test.
    const chickCategory = await prisma.productCategoryConfig.upsert({
      where: { companyId_slug: { companyId, slug: CHICKS_CATEGORY_SLUG } },
      update: {},
      create: { companyId, name: 'Pollos Bebé', slug: CHICKS_CATEGORY_SLUG },
    });

    const chickProducts = await Promise.all(
      ['Pollito BB', 'Pollito BB Premium'].map((name) =>
        prisma.product.create({
          data: {
            companyId,
            name: `${MARKER} ${name}`,
            categoryId: chickCategory.id,
            unitId: unit.id,
            currentStock: 0,
            minStock: 0,
          },
        }),
      ),
    );
    made.chickProductIds.push(...chickProducts.map((one) => one.id));

    const processedProduct = await prisma.product.findFirst({
      where: { companyId, name: 'Pollo Beneficiado' },
    });

    await prisma.botFlowSession.deleteMany({ where: { channel: CHANNEL } });

    console.log('\n2. Todas las preguntas que se pueden tocar, se tocan');

    for (const [kind, definition] of Object.entries(WIZARDS)) {
      const tappable = definition.steps.filter((s) => s.kind === 'choice' || s.kind === 'date').length;
      const typed = definition.steps.filter((s) => s.kind === 'number' || s.kind === 'text').length;
      console.log(`       ${kind}: ${definition.steps.length} preguntas · ${tappable} tocando · ${typed} escribiendo`);
      check(
        `${kind}: toda opción tiene de dónde salir`,
        definition.steps
          .filter((s) => s.kind === 'choice')
          .every((s) => Boolean(s.optionsKey || s.fixedOptions)),
        'una pregunta de elegir sin lista se vería vacía',
      );
      check(
        `${kind}: solo se escriben cantidades y nombres`,
        definition.steps
          .filter((s) => s.kind === 'number' || s.kind === 'text')
          .every((s) => !s.optionsKey && !s.fixedOptions),
      );
    }

    console.log('\n3. Registrar una venta paso a paso');

    const start = await wizard.start(companyId, 'sale', CHANNEL, USER);
    check('la primera pregunta es por el cliente', start.text.includes('Quién compra'), start.text);
    check('viene con opciones para tocar', (start.buttons?.length ?? 0) > 1);
    check('siempre se puede cancelar', Boolean(start.buttons?.some((b) => b.title.includes('Cancelar'))));
    check('numera la pregunta', start.text.includes('(1 de 8)'), start.text);

    // Escribir en una lista larga la filtra; no la responde. Elegir sigue
    // siendo un toque, para que una coincidencia parecida no se dé por buena.
    const filtered = await type('zulay');
    check(
      'escribir un nombre filtra la lista',
      filtered.text.includes('¿Quién compra?') &&
        Boolean(filtered.buttons?.some((b) => b.title.includes('Zulay Comprador'))),
      filtered.text,
    );
    check(
      'filtrar deja muchas menos filas que la lista entera',
      (filtered.buttons?.length ?? 99) < (start.buttons?.length ?? 0),
      `${filtered.buttons?.length} de ${start.buttons?.length}`,
    );
    check(
      'dice cuántas casaron',
      filtered.text.includes('con "zulay"'),
      filtered.text,
    );

    // Sin acentos y en minúscula: es como se teclea de verdad.
    const unaccented = await type('zulay comprador');
    check(
      'la búsqueda ignora acentos y mayúsculas',
      Boolean(unaccented.buttons?.some((b) => b.title.includes('Zulay Comprador'))),
      unaccented.text,
    );

    const noMatch = await type('zzzzz');
    check(
      'una búsqueda sin resultados no encierra al usuario',
      noMatch.text.includes('No encontré nada') && (noMatch.buttons?.length ?? 0) > 1,
      noMatch.text,
    );

    const stillFixed = await type('cualquier cosa');
    check(
      'la lista sigue ahí después de fallar la búsqueda',
      stillFixed.text.includes('¿Quién compra?'),
      stillFixed.text,
    );

    // The disposable client sorts last and owes nothing, so it lands on a later
    // page — exactly the case that used to be unreachable from the phone.
    const found = await pageUntil(start, `${MARKER} Zulay Comprador`, tap);
    check('se llega al cliente paginando', found.pages > 1, `lo encontró en la página ${found.pages}`);
    check(
      'el paginador dice en qué página vas',
      Boolean(find(found.reply, 'Ver más')?.description?.includes('Página')),
      find(found.reply, 'Ver más')?.description,
    );
    check(
      'ninguna página pasa de diez filas',
      (found.reply?.buttons?.length ?? 0) <= 10,
      String(found.reply?.buttons?.length),
    );

    // El tipo va antes que el lote: decide de dónde salen las aves, y por lo
    // tanto qué lotes tiene sentido ofrecer.
    let reply = await tap(pick(found.reply, `${MARKER} Zulay Comprador`));
    check('elegir cliente pasa al tipo', reply?.text.includes('Cómo va el pollo') === true, reply?.text);

    const afterClient = await prisma.botFlowSession.findFirst({
      where: { channel: CHANNEL, externalUserId: USER, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    check(
      'la pregunta siguiente abre en su primera página',
      (afterClient?.answers as Record<string, string>)?.__page === '0',
      (afterClient?.answers as Record<string, string>)?.__page,
    );

    reply = await tap(pick(reply, 'Vivo'));
    check('elegir el tipo pasa al lote', reply?.text.includes('De qué lote') === true, reply?.text);

    reply = await tap(pick(reply, `${MARKER}-LOT`));
    check('pide la cantidad', reply?.text.includes('Cuántas aves') === true, reply?.text);

    const badNumber = await type('como veinte');
    check('rechaza lo que no es un número', badNumber.text.includes('No entendí'), badNumber.text);

    reply = await type('20');
    check('acepta la cantidad y pide kilos', reply.text.includes('Cuántos kilos') === true, reply.text);

    reply = await type('22,5');
    check('acepta decimales con coma', reply.text.includes('cuánto el kilo') === true, reply.text);

    reply = await type('4');
    check('pide la fecha', reply.text.includes('Qué día fue') === true, reply.text);

    const dateOptions = reply.buttons ?? [];
    check('la fecha se elige de una lista', dateOptions.length > 3, String(dateOptions.length));
    check('ofrece hoy y ayer', dateOptions.some((b) => b.title.startsWith('Hoy')) && dateOptions.some((b) => b.title.startsWith('Ayer')));
    check('no ofrece fechas futuras', !dateOptions.some((b) => b.title.startsWith('Mañana')));
    check('la lista de días también cabe en diez filas', dateOptions.length <= 10, String(dateOptions.length));

    // Paging back a couple of weeks has to work: registering something you
    // forgot is the whole reason the date is a question and not just "hoy".
    const olderDays = await tap(pick(reply, 'Ver más días'));
    check(
      'se puede llegar a días más viejos',
      Boolean(olderDays?.buttons?.some((b) => /^\wi?\w{2} \d{2}\/\d{2}$/.test(b.title))),
      olderDays?.buttons?.map((b) => b.title).join(' | '),
    );

    const backToToday = await pageUntil(olderDays, 'Hoy', tap);
    check('el paginador da la vuelta hasta hoy', backToToday.pages > 1, `${backToToday.pages} páginas`);
    reply = backToToday.reply!;

    reply = (await tap(pick(reply, 'Hoy')))!;
    check('pregunta cómo quedó', reply.text.includes('Cómo quedó'), reply.text);

    reply = (await tap(pick(reply, 'Fiada')))!;
    check('muestra el resumen antes de registrar', reply.text.includes('¿Lo registro así?'), reply.text);
    check('el resumen trae el cliente', reply.text.includes(`${MARKER} Zulay Comprador`));
    check('el resumen trae los kilos', reply.text.includes('22.5') || reply.text.includes('22,5'));
    check('el resumen dice la fecha en palabras', /Hoy/.test(reply.text));

    const confirmId = pick(reply, 'Registrar');
    reply = (await tap(confirmId))!;
    check('acusa el registro', reply.text.includes('✅'), reply.text);

    const sale = await prisma.sale.findFirst({ where: { companyId, batchId: batch.id } });
    check('creó la venta', Boolean(sale));
    check('con la cantidad', sale?.quantity === 20, String(sale?.quantity));
    check('con los kilos', Number(sale?.weightKg) === 22.5, String(sale?.weightKg));
    check('con el total calculado', Number(sale?.totalAmount) === 90, String(sale?.totalAmount));
    check('queda fiada', sale?.paymentStatus === 'pending', sale?.paymentStatus);

    console.log('\n4. Volver a tocar Registrar no duplica');

    const again = await tap(confirmId);
    check('el segundo toque no registra', again === null || again.text.includes('ya lo registré'), again?.text);
    check('sigue habiendo una sola venta', (await prisma.sale.count({ where: { batchId: batch.id } })) === 1);

    console.log('\n5. El que quedó debiendo sube a la primera página');

    // Same client, one fiada sale later. Alphabetically it is still last; what
    // moved it is the balance, which is the point — you sell to the people you
    // are already doing business with.
    const reordered = await wizard.start(companyId, 'sale', CHANNEL, USER);
    const onFirstPage = find(reordered, `${MARKER} Zulay Comprador`);
    check('ahora aparece sin paginar', Boolean(onFirstPage), reordered.buttons?.map((b) => b.title).join(' | '));
    check('y dice cuánto debe', onFirstPage?.description?.includes('90') === true, onFirstPage?.description);
    await tap(pick(reordered, 'Cancelar'));

    console.log('\n6. Cancelar en medio no deja nada');

    const started = await wizard.start(companyId, 'sale', CHANNEL, USER);
    const afterCancel = await tap(pick(started, 'Cancelar'));
    check('acusa la cancelación', afterCancel?.text.includes('No registré nada') === true, afterCancel?.text);
    check('no quedó una venta nueva', (await prisma.sale.count({ where: { batchId: batch.id } })) === 1);

    const wordCancel = await wizard.start(companyId, 'sale', CHANNEL, USER);
    check('abre otra vez', Boolean(wordCancel.buttons?.length));
    const typedCancel = await type('cancelar');
    check('escribir "cancelar" también sale', typedCancel.text.includes('No registré nada'), typedCancel.text);

    console.log('\n7. Preguntas que se pueden omitir');

    const log = await wizard.start(companyId, 'daily_log', CHANNEL, USER);
    let logReply = await tap(pick(log, `${MARKER}-LOT`));
    logReply = await tap(pick(logReply, 'Hoy'));
    check('el registro diario pide la mortalidad', logReply?.text.includes('murieron') === true, logReply?.text);

    logReply = await type('3');
    check('lo opcional se puede omitir', Boolean(logReply?.buttons?.some((b) => b.title.includes('Omitir'))));

    logReply = await tap(pick(logReply, 'Omitir'));
    logReply = await tap(pick(logReply, 'Omitir'));
    check('llega al resumen sin llenar lo opcional', logReply?.text.includes('¿Lo registro así?') === true, logReply?.text);

    logReply = await tap(pick(logReply, 'Registrar'));
    check('registra el día', logReply?.text.includes('✅') === true, logReply?.text);

    const dailyLog = await prisma.dailyLog.findFirst({ where: { batchId: batch.id } });
    check('guardó la mortalidad', dailyLog?.mortality === 3, String(dailyLog?.mortality));
    check('dejó vacío lo omitido', dailyLog?.feedConsumedKg === null, String(dailyLog?.feedConsumedKg));

    console.log('\n8. Las preguntas que sobran no se hacen');

    const selfProc = await wizard.start(companyId, 'processing', CHANNEL, USER);
    let selfReply = await tap(pick(selfProc, `${MARKER}-LOT`));
    selfReply = await type('2');
    selfReply = await tap(pick(selfReply, 'Nosotros'));
    check(
      'beneficiar uno mismo no pregunta a quién pagarle',
      selfReply?.text.includes('Qué día fue') === true,
      selfReply?.text,
    );
    await tap(pick(selfReply, 'Cancelar'));

    console.log('\n9. Registrar un beneficio de terceros hasta el final');

    const birdsBeforeProc = (await prisma.batch.findFirstOrThrow({ where: { id: batch.id } })).currentQuantity;
    const txBeforeProc = await prisma.transaction.count({ where: { companyId, batchId: batch.id } });

    let proc = await wizard.start(companyId, 'processing', CHANNEL, USER);
    proc = (await tap(pick(proc, `${MARKER}-LOT`)))!;
    proc = await type('6');
    proc = (await tap(pick(proc, 'Alguien más')))!;
    check('pregunta a quién pagarle', proc.text.includes('quién se le paga'), proc.text);

    proc = await type('Carmen E2E');
    check('pide el costo en bolívares', /cuánto costó/i.test(proc.text) && proc.text.includes('bolívares'), proc.text);

    proc = await type('2.450');
    proc = (await tap(pick(proc, 'Hoy')))!;
    check('el resumen dice el costo como se escribe aquí', proc.text.includes('2.450'), proc.text);

    proc = (await tap(pick(proc, 'Registrar')))!;
    check('acusa el beneficio', proc.text.includes('✅'), proc.text);

    const created = await prisma.processing.findFirstOrThrow({
      where: { companyId, batchId: batch.id },
      orderBy: { createdAt: 'desc' },
    });
    check('sacó las aves del lote',
      (await prisma.batch.findFirstOrThrow({ where: { id: batch.id } })).currentQuantity === birdsBeforeProc - 6);
    check('guardó el costo en bolívares', Number(created.totalCostBs) === 2450, String(created.totalCostBs));
    check('y su equivalente en dólares', Number(created.totalCost) > 0 && Number(created.totalCost) < 2450,
      String(created.totalCost));
    check('queda pendiente de pago', created.paymentStatus === 'pending', created.paymentStatus);
    check('guarda a quién pagarle', created.supplierName === 'Carmen E2E', created.supplierName ?? '');

    const procTx = await prisma.transaction.findFirst({
      where: { companyId, sourceType: 'processing', sourceId: created.id },
    });
    check('reconoce el gasto una sola vez',
      (await prisma.transaction.count({ where: { companyId, batchId: batch.id } })) === txBeforeProc + 1);
    check('el gasto está en bolívares, no en dólares', Number(procTx?.amount) === 2450, String(procTx?.amount));

    console.log('\n10. Planificar un lote con sus pollitos y sus sacos');

    let plan = await wizard.start(companyId, 'batch_plan', CHANNEL, USER);
    check('la primera pregunta es el galpón', plan.text.includes('qué galpón'), plan.text);
    plan = (await tap(pick(plan, `${MARKER} Galpón`)))!;
    plan = (await tap(pick(plan, 'Cobb 500')))!;
    plan = await type('250');
    check('el precio del pollito se puede omitir', Boolean(find(plan, 'Omitir')));

    // Dándolo, el pollito tiene que convertirse en una compra: es la mitad de
    // lo que cuesta el lote y hasta ahora no llegaba a la contabilidad.
    plan = await type('1.500');
    check('con precio, pregunta qué pollito se compró', /Qué pollito/i.test(plan.text), plan.text);
    plan = (await tap(pick(plan, `${MARKER} Pollito BB`)))!;
    check('la fecha de entrada acepta días futuros', Boolean(find(plan, 'Mañana')), titles(plan));

    plan = (await tap(pick(plan, 'Hoy')))!;
    check('después de la fecha pregunta por los insumos', /insumos/i.test(plan.text), plan.text);

    plan = (await tap(pick(plan, 'Sí, agregar')))!;
    check('el insumo empieza por el producto', /Qué compraste/i.test(plan.text), plan.text);
    plan = (await tap(pick(plan, `${MARKER} Alimento Engorde`)))!;
    plan = await type('10');
    check('el costo del insumo se pide por unidad', /cada uno/i.test(plan.text), plan.text);
    plan = await type('450');
    check('el flete del insumo se puede omitir', Boolean(find(plan, 'Omitir')), titles(plan));
    plan = (await tap(pick(plan, 'Omitir')))!;
    check('ofrece agregar otro insumo', Boolean(find(plan, 'Agregar otro insumo')), titles(plan));

    plan = (await tap(pick(plan, 'Agregar otro insumo')))!;
    check('vuelve a preguntar por el producto', /Qué compraste/i.test(plan.text), plan.text);
    check('y dice cuántos van', plan.text.includes('Van 1 insumo'), plan.text);
    plan = (await tap(pick(plan, `${MARKER} Alimento Engorde`)))!;
    // 6 × 483,33 no da 2.900: preguntando el total, el sistema asentaba
    // Bs 2.899,98 donde el usuario había escrito 2.900. Por unidad no hay
    // división y el total sale exacto.
    plan = await type('6');
    plan = await type('483,33');
    plan = (await tap(pick(plan, 'Omitir')))!;
    check('lee de vuelta los dos insumos', plan.text.includes('Van 2') || /2 insumos/i.test(plan.text), plan.text);
    check(
      'y muestra el total ya multiplicado',
      plan.text.includes('4.500,00') && plan.text.includes('2.899,98'),
      plan.text,
    );

    plan = (await tap(pick(plan, 'Planificar lote')))!;
    check('acusa el lote', plan.text.includes('✅'), plan.text);
    check('dice que todavía no es un gasto', /confírmalo/i.test(plan.text), plan.text);

    const planned = await prisma.batch.findFirst({
      where: { companyId, warehouseId: warehouse.id, initialQuantity: 250 },
      include: { entryLines: true },
    });
    if (planned) made.plannedBatchId = planned.id;
    check('creó el lote', Boolean(planned));
    check('nace planificado', planned?.status === 'planned', planned?.status);
    check('con su código', Boolean(planned?.code), planned?.code ?? '');
    check('cargó las tres compras', planned?.entryLines.length === 3, String(planned?.entryLines.length));

    const chickLine = planned?.entryLines.find((line) => line.productId === made.chickProductIds[0]);
    check('la de los pollitos va por la cantidad del lote', Number(chickLine?.quantity) === 250, String(chickLine?.quantity));
    check('al precio que se dio', Number(chickLine?.costPerUnit) === 1500, String(chickLine?.costPerUnit));

    const supplyLines = planned?.entryLines.filter((line) => line.productId === product.id) ?? [];
    check('los dos sacos quedaron aparte', supplyLines.length === 2, String(supplyLines.length));
    check(
      'con el precio unitario tal cual se escribió',
      supplyLines.map((line) => Number(line.costPerUnit)).sort((a, b) => a - b).join('/') === '450/483.33',
      supplyLines.map((line) => String(line.costPerUnit)).join('/'),
    );
    check('ninguna se procesó todavía', planned?.entryLines.every((line) => !line.processed) === true);
    check(
      'planificar no reconoce ningún gasto',
      (await prisma.transaction.count({ where: { companyId, batchId: planned?.id } })) === 0,
    );

    console.log('\n10b. Confirmar ese lote desde el bot');

    const stockBeforeConfirm = Number(
      (await prisma.product.findFirstOrThrow({ where: { id: product.id } })).currentStock,
    );

    const lotes = await type('lotes');
    const confirmRow = find(lotes, 'Confirmar');
    check('la pantalla de Lotes ofrece confirmar', Boolean(confirmRow), titles(lotes));

    let confirm = await tap(confirmRow!.id);
    // Con más de un lote planificado en la empresa, ese botón abre el selector.
    if (!find(confirm, 'Sí, llegaron')) {
      confirm = await tap(pick(confirm, planned!.code!));
    }
    check('lee de vuelta lo que va a registrar', /Al confirmar registro estas compras/i.test(confirm?.text ?? ''), confirm?.text);
    // 250 × 1.500 + 10 × 450 + 6 × 483,33.
    check('con el total en bolívares', confirm?.text.includes('382.399,98') === true, confirm?.text);
    check('y no lo hace todavía', Boolean(find(confirm, 'Sí, llegaron')), titles(confirm));
    check(
      'nada se registró con solo abrir la pregunta',
      (await prisma.productEntry.count({ where: { companyId, batchId: planned?.id } })) === 0,
    );

    confirm = await tap(pick(confirm, 'Sí, llegaron'));
    check('acusa la crianza', /entró a crianza/i.test(confirm?.text ?? ''), confirm?.text);
    check('y pide el comprobante', confirm?.text.includes('📸') === true, confirm?.text);

    const afterConfirm = await prisma.batch.findUniqueOrThrow({ where: { id: planned!.id } });
    check('el lote pasó a crianza', afterConfirm.status === 'breeding', afterConfirm.status);

    const confirmedEntries = await prisma.productEntry.findMany({
      where: { companyId, batchId: planned!.id },
    });
    made.entryIds.push(...confirmedEntries.map((one) => one.id));
    check('las tres compras se hicieron reales', confirmedEntries.length === 3, String(confirmedEntries.length));
    check('todas recibidas', confirmedEntries.every((one) => one.status === 'received'));
    check('y todas por pagar', confirmedEntries.every((one) => one.paymentStatus === 'pending'));
    check(
      'el gasto quedó reconocido una vez por compra',
      (await prisma.transaction.count({ where: { companyId, batchId: planned!.id } })) === 3,
    );
    check(
      'el de los pollitos va a su categoría, no a "otros"',
      (await prisma.transaction.count({
        where: { companyId, batchId: planned!.id, category: 'chicks' },
      })) === 1,
    );
    check(
      'y el alimento subió el inventario',
      Number((await prisma.product.findFirstOrThrow({ where: { id: product.id } })).currentStock) ===
        stockBeforeConfirm + 16,
    );

    // El doble toque: el botón sigue en pantalla y volver a tocarlo no puede
    // duplicar ni el stock ni el gasto.
    const reconfirm = await tap(buildButtonId(BUTTON.BATCH_CONFIRM, planned!.id, 'ok'));
    check('confirmar dos veces no registra nada nuevo', /ya estaba confirmado/i.test(reconfirm?.text ?? ''), reconfirm?.text);
    check(
      'y no duplica el gasto',
      (await prisma.transaction.count({ where: { companyId, batchId: planned!.id } })) === 3,
    );
    check(
      'ni el inventario',
      Number((await prisma.product.findFirstOrThrow({ where: { id: product.id } })).currentStock) ===
        stockBeforeConfirm + 16,
    );

    console.log('\n10c. Registrar una compra desde el menú principal');

    const home = await type('hola');
    check('el menú ofrece registrar una compra', Boolean(find(home, 'Registrar una compra')), titles(home));

    const shortcut = await type('sacos');
    check('y "sacos" abre esa misma operación', /Qué compraste/i.test(shortcut.text), shortcut.text);
    await tap(pick(shortcut, 'Cancelar'));

    console.log('\n11. Registrar una compra hasta el final');

    const stockBefore = Number((await prisma.product.findFirstOrThrow({ where: { id: product.id } })).currentStock);
    const txBeforeEntry = await prisma.transaction.count({ where: { companyId } });

    let entry = await wizard.start(companyId, 'entry', CHANNEL, USER);
    check('la primera pregunta es el producto', entry.text.includes('Qué compraste'), entry.text);
    entry = (await tap(pick(entry, `${MARKER} Alimento`)))!;
    entry = await type('8');
    entry = await type('3.200');
    check('el flete se puede omitir', Boolean(find(entry, 'Omitir')));
    entry = (await tap(pick(entry, 'Omitir')))!;
    check('el proveedor se puede omitir', Boolean(find(entry, 'Omitir')));
    entry = await type('Agropecuaria E2E');
    check('pregunta para qué lote', entry.text.includes('qué lote'), entry.text);
    entry = (await tap(pick(entry, 'Sin lote')))!;
    entry = (await tap(pick(entry, 'Hoy')))!;
    check('pregunta si ya llegó', /ya lleg/i.test(entry.text), entry.text);

    entry = (await tap(pick(entry, 'ya llegó')))!;
    entry = (await tap(pick(entry, 'Registrar')))!;
    check('acusa la compra', entry.text.includes('✅'), entry.text);

    const productEntry = await prisma.productEntry.findFirst({
      where: { companyId, productId: product.id },
      orderBy: { createdAt: 'desc' },
    });
    if (productEntry) made.entryIds.push(productEntry.id);
    check('creó la compra', Boolean(productEntry));
    check('quedó recibida', productEntry?.status === 'received', productEntry?.status);
    check('guarda al proveedor', productEntry?.supplierName === 'Agropecuaria E2E', productEntry?.supplierName ?? '');
    check('el costo en bolívares', Number(productEntry?.totalCost) === 3200, String(productEntry?.totalCost));
    check('queda pendiente de pago', productEntry?.paymentStatus === 'pending', productEntry?.paymentStatus);
    check('subió el stock',
      Number((await prisma.product.findFirstOrThrow({ where: { id: product.id } })).currentStock) === stockBefore + 8);
    check('reconoce el gasto al recibir',
      (await prisma.transaction.count({ where: { companyId } })) === txBeforeEntry + 1);

    console.log('\n12. Vender beneficiado con el lote en cero');

    // El caso que rompió en producción: los tres lotes en cero y 83 pollos
    // beneficiados en la nevera. El asistente decía "no tienes lotes con aves
    // disponibles" y cerraba la venta entera.
    const stockProduct = await prisma.product.findFirst({
      where: { companyId, name: 'Pollo Beneficiado' },
    });
    const processedOnHand = stockProduct ? Number(stockProduct.currentStock) : 0;
    // Every batch of the company, not just the two this script made: any live
    // bird anywhere brings "Vivo" back, and other suites leave batches behind.
    const alive = await prisma.batch.findMany({
      where: { companyId, currentQuantity: { gt: 0 } },
      select: { id: true, currentQuantity: true },
    });
    const birdsBefore = new Map(alive.map((one) => [one.id, one.currentQuantity]));
    const zeroed = alive.map((one) => one.id);

    await prisma.batch.updateMany({ where: { id: { in: zeroed } }, data: { currentQuantity: 0 } });
    restoreBirds = async () => {
      for (const [id, quantity] of birdsBefore) {
        await prisma.batch.updateMany({ where: { id }, data: { currentQuantity: quantity } });
      }
    };

    const withStock = await wizard.start(companyId, 'sale', CHANNEL, USER);
    check('la venta se abre igual', Boolean(withStock.buttons?.length), withStock.text);

    let sold = await tap(pick(withStock, `${MARKER} Zulay Comprador`));
    // Solo con paginar se llega; el cliente ya quedó debiendo del paso 3.
    sold = (await pageUntil(withStock, `${MARKER} Zulay Comprador`, tap)).reply!;
    sold = (await tap(pick(sold, `${MARKER} Zulay Comprador`)))!;

    check('pregunta el tipo', sold.text.includes('Cómo va el pollo'), sold.text);
    check(
      'no ofrece vender vivo sin aves en pie',
      !find(sold, 'Vivo'),
      sold.buttons?.map((b) => b.title).join(' | '),
    );
    if (processedOnHand > 0) {
      check('sí ofrece beneficiado', Boolean(find(sold, 'Beneficiado')));
      check(
        'y dice cuántos hay',
        find(sold, 'Beneficiado')?.description?.includes(String(processedOnHand)) === true,
        find(sold, 'Beneficiado')?.description,
      );

      let dead = (await tap(pick(sold, 'Beneficiado')))!;
      check('ofrece lotes aunque estén en cero', Boolean(find(dead, `${MARKER}-LOT`)),
        dead.buttons?.map((b) => b.title).join(' | '));

      // Lo de **este** lote, no el total de la empresa: poner el total al lado
      // de cada lote le decía al usuario que en uno vacío quedaban 83.
      const ownStock = find(dead, `${MARKER}-LOT`)?.description ?? '';
      check('dice cuántos tiene ese lote', ownStock.includes('6 beneficiados de este lote'), ownStock);
      check(
        'no ofrece lotes sin beneficiados propios',
        !dead.buttons?.some((b) => b.description?.includes('0 beneficiados')),
        dead.buttons?.map((b) => b.description).join(' | '),
      );

      // Hasta el final: cancelar aquí fue lo que dejó pasar el bug de que el
      // ejecutor validaba el lote contra la lista equivocada y respondía
      // "esa opción ya no está disponible" justo al confirmar.
      dead = (await tap(pick(dead, `${MARKER}-LOT`)))!;
      dead = await type('4');
      dead = await type('6');
      dead = await type('4');
      dead = (await tap(pick(dead, 'Hoy')))!;
      dead = (await tap(pick(dead, 'Fiada')))!;
      check('llega al resumen', dead.text.includes('¿Lo registro así?'), dead.text);

      dead = (await tap(pick(dead, 'Registrar')))!;
      check('registra la venta de beneficiado', dead.text.includes('✅'), dead.text);

      const deadSale = await prisma.sale.findFirst({
        where: { companyId, batchId: batch.id, saleType: 'dead' },
        orderBy: { createdAt: 'desc' },
      });
      check('creó la venta', Boolean(deadSale));
      check('quedó como beneficiada', deadSale?.saleType === 'dead', deadSale?.saleType);
      check('con las aves y los kilos', deadSale?.quantity === 4 && Number(deadSale?.weightKg) === 6);

      // Sale del inventario de procesados, no del lote: el lote ya estaba en
      // cero y tiene que seguir en cero.
      check(
        'descontó del inventario de beneficiados',
        Number((await prisma.product.findFirstOrThrow({ where: { id: processedProduct!.id } })).currentStock)
          === processedOnHand - 4,
      );
      check(
        'no tocó el lote',
        (await prisma.batch.findFirstOrThrow({ where: { id: batch.id } })).currentQuantity === 0,
      );
    } else {
      check('sin nada que vender, lo dice', withStock.text.includes('no hay nada que vender') ||
        withStock.text.includes('ni pollo beneficiado'), withStock.text);
    }

    await restoreBirds();
    restoreBirds = async () => {};

    console.log('\n13. El menú abre el asistente, no una disculpa');

    const menu = await type('hola');
    check(
      'escribir cualquier cosa abre el menú entero',
      (menu.buttons?.length ?? 0) === MENU_OPERATIONS.length,
      `${menu.buttons?.length} filas de ${MENU_OPERATIONS.length}`,
    );
    // El número que importa no es cuántas filas hay hoy, es que quepan: por
    // encima de diez Meta rechaza el mensaje entero y el menú deja de salir.
    check(
      'y cabe en una lista de WhatsApp',
      (menu.buttons?.length ?? 0) <= 10,
      String(menu.buttons?.length),
    );

    const saleRow = menu.buttons!.find((b) => b.title.includes('Registrar una venta'))!;
    const opened = await tap(saleRow.id);
    check('la fila de ventas abre la primera pregunta', opened?.text.includes('Quién compra') === true, opened?.text);
    await tap(pick(opened, 'Cancelar'));

    console.log('\n14. Las filas del menú responden con datos de verdad');

    // Cada fila tiene que decir algo que solo puede saber mirando la base. Un
    // "no hay nada" con una granja llena pasaría un test que solo comprobara
    // que la fila no revienta.
    const rows: Array<{ title: string; mustSay: RegExp[]; note: string }> = [
      { title: 'Cobrar una venta', mustSay: [new RegExp(MARKER)], note: 'nombra al cliente que debe' },
      // Processing and purchases now share one menu row; it has to list both.
      {
        title: 'Pagar algo pendiente',
        mustSay: [new RegExp(`${MARKER}-BEN|Carmen E2E|2\\.450`), /3\.200|Agropecuaria E2E/],
        note: 'lista el beneficio y la compra sin pagar',
      },
      { title: 'Lotes', mustSay: [new RegExp(`${MARKER}-LOT`)], note: 'nombra el lote activo' },
      { title: 'Consultas', mustSay: [/Te deben|Debes/], note: 'resume lo que te deben y lo que debes' },
      { title: 'Saldos', mustSay: [/Saldos/], note: 'muestra las cuentas' },
      { title: 'Comprobantes', mustSay: [/comprobante/i], note: 'habla de los comprobantes' },
    ];

    for (const row of rows) {
      const button = menu.buttons!.find((b) => b.title.includes(row.title));
      if (!button) {
        check(`la fila "${row.title}" existe`, false);
        continue;
      }
      const answer = await tap(button.id);
      check(
        `${row.title}: ${row.note}`,
        row.mustSay.every((pattern) => pattern.test(answer?.text ?? '')),
        answer?.text?.slice(0, 160),
      );
    }

    const dailyRow = menu.buttons!.find((b) => b.title.includes('Registro diario'))!;
    const dailyOpened = await tap(dailyRow.id);
    check(
      'Registro diario: abre su primera pregunta',
      dailyOpened?.text.includes('De qué lote') === true,
      dailyOpened?.text,
    );
    await tap(pick(dailyOpened, 'Cancelar'));

    console.log('\n15. Varias ventas en una tanda, una por cliente');

    // Aves contadas a propósito: la tanda tiene que caber justa, y la que no
    // cabe tiene que rebotar entera.
    await prisma.batch.update({
      where: { id: batch.id },
      data: { currentQuantity: 30, status: 'for_sale' },
    });
    const before = await prisma.sale.count({ where: { batchId: batch.id } });

    let run: OutgoingMessage | null = await wizard.start(companyId, 'sale', CHANNEL, USER);
    run = await type('zulay');
    run = await tap(pick(run, 'Zulay Comprador'));
    run = await tap(pick(run, 'Vivo'));
    run = await tap(pick(run, `${MARKER}-LOT`));
    run = await type('10');
    run = await type('25');
    run = await type('4');
    run = await tap(pick(run, 'Hoy'));
    run = await tap(pick(run, 'Fiada'));

    check('el resumen ofrece agregar otro cliente', Boolean(find(run, 'Otro cliente')), run?.text);

    run = await tap(pick(run, 'Otro cliente'));
    // Con los signos: el resumen también dice "Quién compra", sin ellos, y esa
    // aserción pasaba en verde mientras la pantalla no había cambiado.
    check('agregar otro vuelve a preguntar por el cliente', run?.text.includes('¿Quién compra?') === true, run?.text);
    check('dice cuántas van en la tanda', run?.text.includes('Van 1 en esta tanda') === true, run?.text);
    check(
      'no registró nada todavía',
      (await prisma.sale.count({ where: { batchId: batch.id } })) === before,
    );

    // El segundo cliente solo cuesta tres preguntas: lote, precio y fecha ya
    // quedaron contestados para toda la tanda.
    run = await type('cliente 0');
    run = await tap(pick(run, `${MARKER} Cliente 0`));
    check('salta directo a la cantidad', run?.text.includes('Cuántas aves') === true, run?.text);

    run = await type('8');
    run = await type('20');
    check('vuelve al resumen sin repreguntar el lote', run?.text.includes('Registro las 2 ventas') === true, run?.text);
    check(
      'el resumen lista los dos clientes',
      run?.text.includes('Zulay Comprador') === true && run?.text.includes('Cliente 0') === true,
      run?.text,
    );

    run = await tap(pick(run, 'Registrar 2'));
    check('acusa las dos ventas', run?.text.includes('2 ventas registradas') === true, run?.text);

    const batchAfter = await prisma.batch.findUnique({ where: { id: batch.id } });
    check(
      'creó exactamente dos ventas',
      (await prisma.sale.count({ where: { batchId: batch.id } })) - before === 2,
    );
    check('descontó las 18 aves de una vez', batchAfter?.currentQuantity === 12, String(batchAfter?.currentQuantity));

    const runCodes = await prisma.sale.findMany({
      where: { batchId: batch.id },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { code: true },
    });
    const numbers = runCodes.map((one) => Number(one.code?.split('-')[1])).sort((a, b) => a - b);
    check('con códigos consecutivos', numbers[1] - numbers[0] === 1, numbers.join(', '));

    console.log('\n16. Una tanda que no cabe en el lote no se registra a medias');

    // Cada fila cabe sola —6 y 6 contra 10— y juntas no. Es exactamente lo que
    // un bucle de ventas sueltas deja pasar.
    const tight = await prisma.batch.update({
      where: { id: batch.id },
      data: { currentQuantity: 10 },
    });
    const beforeTight = await prisma.sale.count({ where: { batchId: batch.id } });

    run = await wizard.start(companyId, 'sale', CHANNEL, USER);
    run = await type('zulay');
    run = await tap(pick(run, 'Zulay Comprador'));
    run = await tap(pick(run, 'Vivo'));
    run = await tap(pick(run, `${MARKER}-LOT`));
    run = await type('6');
    run = await type('15');
    run = await type('4');
    run = await tap(pick(run, 'Hoy'));
    run = await tap(pick(run, 'Fiada'));
    run = await tap(pick(run, 'Otro cliente'));
    run = await type('cliente 1');
    run = await tap(pick(run, `${MARKER} Cliente 1`));
    run = await type('6');
    run = await type('15');
    run = await tap(pick(run, 'Registrar 2'));

    check('la tanda que no cabe se rechaza', run?.text.includes('No pude registrarlo') === true, run?.text);
    check('y dice cuánto suma contra cuánto hay', run?.text.includes('suman') === true, run?.text);
    check(
      'no escribió ninguna de las dos',
      (await prisma.sale.count({ where: { batchId: batch.id } })) === beforeTight,
    );
    const untouched = await prisma.batch.findUnique({ where: { id: batch.id } });
    check('ni tocó el lote', untouched?.currentQuantity === tight.currentQuantity, String(untouched?.currentQuantity));

    // Fallar no puede dejar la tanda sin salida: el mensaje decía "toca
    // Registrar otra vez" y no mandaba un solo botón.
    check('el fallo deja los botones para reintentar', (run?.buttons?.length ?? 0) >= 2, String(run?.buttons?.length));
    check('y conserva lo respondido', run?.text.includes('Zulay Comprador') === true, run?.text);

    await tap(pick(run, 'Cancelar'));

    console.log('\n17. Buscar y "varios clientes" se ven sin saber que existen');

    await prisma.batch.update({
      where: { id: batch.id },
      data: { currentQuantity: 50, status: 'for_sale' },
    });

    const saleStep = await wizard.start(companyId, 'sale', CHANNEL, USER);
    check('la primera pregunta ofrece buscar', Boolean(find(saleStep, 'Buscar por nombre')), titles(saleStep));
    check('y ofrece varios clientes', Boolean(find(saleStep, 'Varios clientes')), titles(saleStep));
    check('sin tanda abierta no ofrece registrar', !find(saleStep, 'Registrar '), titles(saleStep));
    check(
      'la lista sigue cabiendo en diez filas',
      (saleStep.buttons?.length ?? 0) <= 10,
      String(saleStep.buttons?.length),
    );

    // Tocar "Buscar" no responde la pregunta: solo lo dice más claro. Va antes
    // de avanzar, porque re-renderiza el paso en el que esté la sesión.
    const prompted = await tap(pick(saleStep, 'Buscar por nombre'));
    check('tocar buscar pide el nombre', prompted?.text.includes('Escríbeme el nombre') === true, prompted?.text);
    check('y deja la pregunta en pie', prompted?.text.includes('¿Quién compra?') === true, prompted?.text);

    // La lista de lotes son dos filas: un botón de buscar ahí sería ruido.
    const shortList = await tap(pick(await tap(pick(prompted, 'Zulay Comprador')), 'Vivo'));
    check('una lista corta no ofrece buscar', !find(shortList, 'Buscar por nombre'), titles(shortList));
    check('ni ofrece varios clientes fuera del paso de cliente', !find(shortList, 'Varios clientes'), titles(shortList));

    console.log('\n18. La tanda arrancada desde la primera pregunta no pasa por la confirmación');

    let batchRun: OutgoingMessage | null = await wizard.start(companyId, 'sale', CHANNEL, USER);
    batchRun = await tap(pick(batchRun, 'Varios clientes'));
    check('avisa que va a sumar clientes', batchRun?.text.includes('sumando clientes') === true, batchRun?.text);

    batchRun = await type('zulay');
    batchRun = await tap(pick(batchRun, 'Zulay Comprador'));
    batchRun = await tap(pick(batchRun, 'Vivo'));
    batchRun = await tap(pick(batchRun, `${MARKER}-LOT`));
    batchRun = await type('4');
    batchRun = await type('10');
    batchRun = await type('4');
    batchRun = await tap(pick(batchRun, 'Hoy'));
    batchRun = await tap(pick(batchRun, 'Fiada'));

    // Aquí es donde antes salía "¿Lo registro así?".
    check(
      'terminado el primer cliente vuelve a preguntar por el cliente',
      batchRun?.text.includes('¿Quién compra?') === true,
      batchRun?.text,
    );
    check('y dice cuántas van', batchRun?.text.includes('Van 1 en esta tanda') === true, batchRun?.text);
    check('ahora sí ofrece cerrar la tanda', Boolean(find(batchRun, 'Registrar 1')), titles(batchRun));
    check('y ya no ofrece encenderla otra vez', !find(batchRun, 'Varios clientes'), titles(batchRun));

    const beforeRun = await prisma.sale.count({ where: { batchId: batch.id } });

    batchRun = await type('cliente 2');
    batchRun = await tap(pick(batchRun, `${MARKER} Cliente 2`));
    batchRun = await type('3');
    batchRun = await type('8');
    check('el segundo cliente también vuelve al inicio', batchRun?.text.includes('Van 2 en esta tanda') === true, batchRun?.text);

    batchRun = await tap(pick(batchRun, 'Registrar 2'));
    check('cerrar desde la lista registra las dos', batchRun?.text.includes('2 ventas registradas') === true, batchRun?.text);
    check(
      'creó las dos, ni una más',
      (await prisma.sale.count({ where: { batchId: batch.id } })) - beforeRun === 2,
    );
    const afterRun = await prisma.batch.findUnique({ where: { id: batch.id } });
    check('descontó las 7 aves de la tanda', afterRun?.currentQuantity === 43, String(afterRun?.currentQuantity));
  } finally {
    console.log('\nLimpiando...');
    await restoreBirds();
    await prisma.botFlowSession.deleteMany({ where: { channel: CHANNEL } });
    if (made.batchId) {
      await prisma.dailyLog.deleteMany({ where: { batchId: made.batchId } });
      await prisma.sale.deleteMany({ where: { batchId: made.batchId } });
      await prisma.transaction.deleteMany({ where: { batchId: made.batchId } });
      await prisma.processing.deleteMany({ where: { batchId: made.batchId } });
      await prisma.batch.deleteMany({ where: { id: made.batchId } });
    }
    if (made.entryIds.length > 0) {
      await prisma.transaction.deleteMany({ where: { sourceId: { in: made.entryIds } } });
      await prisma.productEntry.deleteMany({ where: { id: { in: made.entryIds } } });
    }
    if (made.plannedBatchId) {
      await prisma.transaction.deleteMany({ where: { batchId: made.plannedBatchId } });
      await prisma.productEntry.deleteMany({ where: { batchId: made.plannedBatchId } });
      await prisma.batchEntryLine.deleteMany({ where: { batchId: made.plannedBatchId } });
      await prisma.batch.deleteMany({ where: { id: made.plannedBatchId } });
    }
    if (made.productId) await prisma.product.deleteMany({ where: { id: made.productId } });
    if (made.chickProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: made.chickProductIds } } });
    }
    if (made.categoryId) await prisma.productCategoryConfig.deleteMany({ where: { id: made.categoryId } });
    if (made.clientIds.length > 0) {
      await prisma.client.deleteMany({ where: { id: { in: made.clientIds } } });
    }
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
