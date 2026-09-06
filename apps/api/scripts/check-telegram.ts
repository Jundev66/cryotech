/**
 * Comprueba que el asistente cabe en Telegram.
 *
 * El core se escribió contra WhatsApp y arrastra dos convenciones suyas: el
 * markup `*negrita*` y unos ids de botón que llevan el uuid del borrador dentro
 * para que un toque viejo no dispare nada. Telegram no entiende lo primero y
 * corta lo segundo a 64 bytes — `pyb:<uuid>:entry-<uuid>` mide 83 y ni siquiera
 * llega a enviarse. Esto verifica que la traducción entre ambos es exacta y que
 * ningún botón que el asistente ofrece se pierde por el camino.
 *
 * Recorre los cinco asistentes contra la empresa de pruebas y cancela al final:
 * no registra nada.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-telegram.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { TelegramTransportService } from '../src/modules/telegram/telegram-transport.service';
import {
  TelegramCallbackService,
  callbackByteLength,
  MAX_CALLBACK_BYTES,
  packCallbackData,
  unpackCallbackData,
} from '../src/modules/telegram/telegram-callback-data';
import { toInlineKeyboard, toTelegramHtml } from '../src/modules/telegram/telegram-renderer';
import { WIZARDS } from '../src/modules/assistant/wizard/wizard.catalog';
import type { FlowKind } from '../src/modules/assistant/flows/flow.catalog';
import { parseButtonId, type OutgoingMessage } from '../src/modules/assistant/types/assistant.types';
import { targetCompany } from './lib/test-company';
import { resolveTestDebtor } from './lib/test-debtor';

const CHANNEL = 'check-telegram';
const USER = '99900011';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const uuid = (n: number) => `${'0'.repeat(7)}${n}-1111-2222-3333-444444444444`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const companyId = await targetCompany(app, process.argv[2]);
  const prisma = app.get(PrismaService);
  const assistant = app.get(AssistantService);
  const transport = app.get(TelegramTransportService);
  const callbacks = app.get(TelegramCallbackService);

  // --- 1. Empaquetado de uuids -------------------------------------------

  const worst = `pyb:${uuid(1)}:entry-${uuid(2)}`;
  check('el peor id real no cabía sin empaquetar', callbackByteLength(worst) > MAX_CALLBACK_BYTES,
    `${callbackByteLength(worst)} bytes`);
  check('y sí cabe empaquetado',
    callbackByteLength(packCallbackData(worst)) <= MAX_CALLBACK_BYTES,
    `${callbackByteLength(packCallbackData(worst))} bytes`);
  check('empaquetar y desempaquetar devuelve el original',
    unpackCallbackData(packCallbackData(worst)) === worst,
    unpackCallbackData(packCallbackData(worst)));

  // El uuid dentro de `entry-<uuid>` no es un segmento propio: si el
  // empaquetado solo mirara los trozos separados por ':', este se quedaría
  // entero y el id seguiría sin caber.
  check('empaqueta el uuid que va pegado a un prefijo',
    packCallbackData(`entry-${uuid(3)}`).startsWith('entry-~'),
    packCallbackData(`entry-${uuid(3)}`));

  for (const plain of ['mn:sale', 'wz:__cancel', 'cat:feed', 'wz:2026-08-16']) {
    check(`deja intacto lo que no es uuid (${plain})`, packCallbackData(plain) === plain);
  }

  // Un id demasiado largo que no son uuids —el nombre de una raza es texto
  // libre— no puede empaquetarse, así que viaja como testigo opaco.
  const overlong = `wz:${uuid(4)}:${'Raza con un nombre larguísimo de verdad'}`;
  const token = callbacks.encode(overlong);
  check('un id que no cabe ni empaquetado se sustituye por un testigo',
    callbackByteLength(token) <= MAX_CALLBACK_BYTES, `${callbackByteLength(token)} bytes`);
  check('y el testigo devuelve el id entero', callbacks.decode(token) === overlong);
  check('un testigo desconocido no revienta: se devuelve tal cual',
    callbacks.decode('!noExisteEsteToken') === '!noExisteEsteToken');

  // --- 2. Markup ----------------------------------------------------------

  check('*negrita* pasa a <b>', toTelegramHtml('Te deben: *$120,00*') === 'Te deben: <b>$120,00</b>');
  check('escapa antes de convertir', toTelegramHtml('*Pollos & pavos*') === '<b>Pollos &amp; pavos</b>');
  check('un < de un nombre no rompe el mensaje', toTelegramHtml('a <b> c') === 'a &lt;b&gt; c');
  check('un asterisco suelto se queda literal', toTelegramHtml('2 * 3 = 6') === '2 * 3 = 6');
  check('la negrita no cruza líneas', toTelegramHtml('*abre\ny cierra*') === '*abre\ny cierra*');

  // --- 3. Clasificación de updates ---------------------------------------

  const chat = { id: Number(USER) };
  const envelopeOf = (update: Parameters<typeof transport.receive>[0]) => transport.receive(update);

  const textEnvelope = envelopeOf({ update_id: 1, message: { message_id: 1, chat, text: 'hola' } });
  check('un texto se identifica por update_id', textEnvelope?.externalId === '1');
  check('y el remitente es el chat', textEnvelope?.externalUserId === USER);
  check('un texto no es comprobante', textEnvelope?.isReceipt === false);

  const photoEnvelope = envelopeOf({
    update_id: 2,
    message: { message_id: 2, chat, photo: [{ file_id: 'a' }, { file_id: 'b' }] },
  });
  check('una foto sí es comprobante', photoEnvelope?.isReceipt === true);

  const pdfEnvelope = envelopeOf({
    update_id: 3,
    message: { message_id: 3, chat, document: { file_id: 'c', mime_type: 'application/pdf' } },
  });
  check('un PDF no es comprobante', pdfEnvelope?.isReceipt === false);
  check('una captura enviada como archivo sí lo es',
    envelopeOf({
      update_id: 4,
      message: { message_id: 4, chat, document: { file_id: 'd', mime_type: 'image/png' } },
    })?.isReceipt === true);

  check('ningún canal reintenta lo que ya respondimos 200',
    textEnvelope?.redelivers === false);

  // Un toque llega con el id ya empaquetado y tiene que volver a ser el que el
  // core emitió, o el borrador al que apunta no se encuentra.
  const tapId = `cf:${uuid(5)}`;
  const tapped = await transport.toIncoming({
    update_id: 5,
    callback_query: { id: 'q1', data: callbacks.encode(tapId), from: chat, message: { chat } },
  });
  check('un toque se decodifica al id original', tapped?.buttonId === tapId, String(tapped?.buttonId));

  // Una Mini App devuelve exactamente la forma que ya ejecuta FlowSubmissionService.
  const submitted = await transport.toIncoming({
    update_id: 6,
    message: {
      message_id: 6,
      chat,
      web_app_data: { data: JSON.stringify({ flow_token: 'tok-1', sale_type: 'live' }) },
    },
  });
  check('una Mini App llega como flow_reply', submitted?.kind === 'flow_reply');
  check('con su token separado del resto',
    submitted?.flowReply?.flowToken === 'tok-1' &&
      (submitted?.flowReply?.submission as Record<string, unknown>)?.sale_type === 'live');
  check('sin flow_token se descarta',
    (await transport.toIncoming({
      update_id: 7,
      message: { message_id: 7, chat, web_app_data: { data: '{"sale_type":"live"}' } },
    })) === null);

  const voice = await transport.toIncoming({ update_id: 8, message: { message_id: 8, chat } });
  check('un update sin nada que sepamos leer se descarta', voice === null);

  // --- 4. Los cinco asistentes, renderizados de verdad --------------------

  let seen = 0;
  let longest = 0;
  let screens = 0;
  const before = failures;

  // Confirmar y registrar quedan fuera a propósito: esta suite recorre las
  // pantallas para ver los botones, no para dar de alta nada.
  const TERMINAL = /Cancelar|Ver más|Registrar|Confirmar|Guardar/i;

  try {
    for (const kind of Object.keys(WIZARDS) as FlowKind[]) {
      let reply: OutgoingMessage | null = await assistant.openOperation(
        companyId, kind, CHANNEL, USER,
      );

      // Hasta 30 pantallas: de sobra para un asistente entero, y un tope por si
      // alguna vez deja de avanzar.
      for (let screen = 0; screen < 30 && reply; screen++) {
        screens++;

        const html = toTelegramHtml(reply.text);
        if (html.includes('*')) {
          check(`${kind}: queda markup de WhatsApp sin traducir`, false, html.slice(0, 80));
        }

        if (reply.buttons?.length) {
          const keyboard = toInlineKeyboard(reply.buttons, (id) => callbacks.encode(id));

          for (const [index, [button]] of keyboard.entries()) {
            const source = reply.buttons[index];
            const bytes = callbackByteLength(button.callback_data);
            longest = Math.max(longest, bytes);
            seen++;

            if (bytes > MAX_CALLBACK_BYTES) {
              check(`${kind}: "${source.title}" no cabe en callback_data`, false, `${bytes} bytes`);
            }
            if (callbacks.decode(button.callback_data) !== source.id) {
              check(`${kind}: "${source.title}" no vuelve intacto`, false,
                `${callbacks.decode(button.callback_data)} != ${source.id}`);
            }
          }

          const next = reply.buttons.find((b) => !TERMINAL.test(b.title));
          if (!next) break;
          reply = await assistant.handleButton(next.id, companyId, CHANNEL, USER);
          continue;
        }

        // Una pregunta sin botones es de las que se responden escribiendo
        // (cantidad, peso, precio). Sin contestarla el recorrido se quedaría en
        // la segunda pantalla y no vería casi ningún botón.
        reply = await assistant.handleText('1', companyId, CHANNEL, USER);
      }

      // Salir limpio, sin dejar la sesión a medias para la siguiente corrida.
      await assistant.handleText('cancelar', companyId, CHANNEL, USER);
    }
  } finally {
    // Sin rastro, aunque el recorrido se caiga a medias.
    await prisma.botFlowSession.deleteMany({ where: { channel: CHANNEL } });
    await prisma.botDraft.deleteMany({ where: { channel: CHANNEL } });
  }

  check(
    `los ${seen} botones de ${screens} pantallas caben y vuelven intactos`,
    failures === before,
    `el más largo, ${longest} bytes`,
  );
  check('el recorrido llegó a ver botones de verdad', seen > 20, `solo ${seen}`);

  // --- 5. Cobrar: buscar y ver el detalle de un deudor ------------------

  const debtor = await resolveTestDebtor(app, companyId);
  const DEBTOR_CHANNEL = 'check-telegram-collect';

  const debtors = await assistant.handleText('cobrar', companyId, DEBTOR_CHANNEL, USER);
  const debtorButton = debtors.buttons?.find((b) => b.title.includes(debtor.clientName));
  check('el deudor de prueba aparece con un botón', Boolean(debtorButton),
    debtors.buttons?.map((b) => b.title).join(' | '));

  if (debtorButton) {
    check('el botón es del prefijo cs:', parseButtonId(debtorButton.id)?.prefix === 'cs', debtorButton.id);
    const tapped = await assistant.handleButton(debtorButton.id, companyId, DEBTOR_CHANNEL, USER);
    check('tocarlo trae su venta pendiente', Boolean(tapped?.text.includes('SALE') || tapped?.text.includes('▸ *')),
      tapped?.text.slice(0, 80));
  }

  const byName = await assistant.handleText(debtor.clientName, companyId, DEBTOR_CHANNEL, USER);
  check('escribir su nombre completo trae el mismo reporte',
    byName.text.startsWith(`🔎 *${debtor.clientName}*`), byName.text.slice(0, 60));

  const noMatch = await assistant.handleText('esto no es un cliente ni un comando', companyId, DEBTOR_CHANNEL, USER);
  check('texto que no matchea nada avisa antes del menú',
    noMatch.text.startsWith('No entendí "esto no es un cliente ni un comando"'), noMatch.text.slice(0, 60));

  const greeting = await assistant.handleText('hola', companyId, DEBTOR_CHANNEL, USER);
  check('un saludo no dice "No entendí"', !greeting.text.includes('No entendí'), greeting.text.slice(0, 40));

  await app.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
