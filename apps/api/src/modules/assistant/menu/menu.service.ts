import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { BatchesService } from '../../batches/batches.service';
import { PayablesService } from '../../payables/payables.service';
import { ReportsService } from '../../reports/reports.service';
import { AccountsService } from '../../treasury/accounts.service';
import { DraftService } from '../drafts/draft.service';
import { ReceiptQueueService } from '../queue/receipt-queue.service';
import { FlowService } from '../flows/flow.service';
import { WizardService } from '../wizard/wizard.service';
import { ClientResolver } from '../resolvers/client.resolver';
import type { FlowKind } from '../flows/flow.catalog';
import { formatBs, formatUsd } from '../formatting/number.format';
import { BUTTON, buildButtonId, type OutgoingMessage } from '../types/assistant.types';
import { MENU_OPERATIONS, type MenuOperation } from './menu.catalog';

/** A purchase written against a batch that has not been confirmed yet. */
interface PlannedLine {
  quantity: Prisma.Decimal;
  costPerUnit: Prisma.Decimal | null;
  deliveryCost: Prisma.Decimal | null;
}

/** Batch statuses in Spanish, for the one place the user sees them. */
const BATCH_STATUS_LABELS: Record<string, string> = {
  planned: 'Planificado',
  breeding: 'En crianza',
  for_sale: 'Listo para venta',
  finished: 'Cerrado',
};

/**
 * The bot's home screen and the handlers behind each row.
 *
 * Every answer is a message plus buttons — nothing here asks the user to type.
 * An operation that needs several fields (a sale, a daily log) hands off to the
 * step-by-step wizard, which asks them one at a time.
 */
@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly batchesService: BatchesService,
    private readonly payables: PayablesService,
    private readonly reports: ReportsService,
    private readonly accounts: AccountsService,
    private readonly drafts: DraftService,
    private readonly queue: ReceiptQueueService,
    private readonly flows: FlowService,
    private readonly wizard: WizardService,
    private readonly clientResolver: ClientResolver,
  ) {}

  /** The ten operations. This is what "hola" gets. */
  async main(companyId: string, channel: string, externalUserId: string): Promise<OutgoingMessage> {
    const waiting = await this.drafts.countPending(channel, externalUserId);

    const header = waiting > 0
      ? `Tienes *${waiting}* comprobante${waiting === 1 ? '' : 's'} sin clasificar.\n\n¿Qué quieres hacer?`
      : '¿Qué quieres hacer?\n\n_También puedes mandarme la captura de un pago y lo registro._';

    return {
      text: header,
      buttons: MENU_OPERATIONS.map((operation) => ({
        id: buildButtonId(BUTTON.MENU, operation.key),
        title: operation.title,
        description:
          operation.key === 'pending' && waiting > 0
            ? `${waiting} esperando`
            : operation.description,
      })),
    };
  }

  async handle(
    operation: MenuOperation,
    companyId: string,
    channel: string,
    externalUserId: string,
  ): Promise<OutgoingMessage> {
    switch (operation) {
      case 'pending':
        return (
          (await this.queue.presentNext(channel, externalUserId)) ?? {
            text: 'No tienes comprobantes pendientes por clasificar.',
          }
        );
      case 'pay':
        return this.openPayables(companyId);
      case 'processing':
        return this.openOperation('processing', companyId, channel, externalUserId);
      case 'collect':
        return this.debtors(companyId);
      case 'reports':
        return this.overview(companyId);
      case 'balances':
        return this.balances(companyId);
      case 'batches':
        return this.batches(companyId, channel, externalUserId);
      case 'sale':
        return this.openOperation('sale', companyId, channel, externalUserId);
      case 'register_entry':
        return this.openOperation('entry', companyId, channel, externalUserId);
      case 'daily_log':
        return this.openOperation('daily_log', companyId, channel, externalUserId);
    }
  }

  /**
   * A native form when one can actually be sent, the wizard otherwise.
   *
   * Today it is always the wizard — see `services/whatsapp-flows/README.md`.
   * Decided here rather than on AssistantService to keep the dependency
   * pointing one way; AssistantService makes the same call for its buttons.
   */
  private openOperation(
    kind: FlowKind,
    companyId: string,
    channel: string,
    externalUserId: string,
  ): Promise<OutgoingMessage> {
    if (this.flows.isAvailable(kind)) {
      return this.flows.open(companyId, kind, channel, externalUserId);
    }
    return this.wizard.start(companyId, kind, channel, externalUserId);
  }

  private async openPayables(companyId: string): Promise<OutgoingMessage> {
    const open = await this.payables.listOpen(companyId);

    if (open.length === 0) {
      return { text: '✅ No tienes compras ni beneficios pendientes de pago.' };
    }

    const total = open.reduce((sum, payable) => sum + payable.balance, 0);
    const lines = [`💳 *Por pagar* · ${formatBs(round2(total))}`, ''];

    for (const payable of open.slice(0, 10)) {
      const icon = payable.kind === 'processing' ? '🔪' : '📦';
      const who = payable.supplierName ? ` · ${payable.supplierName}` : '';
      const partial =
        payable.paid > 0 ? ` _(abonado ${formatBs(payable.paid)} de ${formatBs(payable.total)})_` : '';
      lines.push(
        `▸ ${icon} *${payable.code ?? payable.description}* · ${formatBs(payable.balance)}${who}${partial}`,
      );
      lines.push(`   ${payable.description}${payable.batchCode ? ` · ${payable.batchCode}` : ''}`);
    }

    if (open.length > 10) lines.push(`\n_y ${open.length - 10} más._`);

    // No buttons: paying needs the account, the reference and the date, and the
    // receipt already carries all three. Asking for them one by one would be
    // slower than forwarding the screenshot.
    lines.push('');
    lines.push('Mándame la captura del pago y lo aplico al que corresponda.');

    return { text: lines.join('\n') };
  }

  private async debtors(companyId: string): Promise<OutgoingMessage> {
    const receivables = await this.reports.getReceivablesByClient(companyId);
    if (receivables.clients.length === 0) {
      return { text: '✅ Nadie te debe nada. Todas las ventas están cobradas.' };
    }

    const shown = receivables.clients.slice(0, 10);
    const lines = [
      `💰 *Clientes que deben* · ${formatUsd(receivables.totals.owedUsd)}` +
        (receivables.totals.owedBs !== null ? ` (${formatBs(receivables.totals.owedBs)})` : ''),
      '',
    ];

    for (const client of shown) {
      lines.push(`▸ *${client.clientName}* · ${formatUsd(client.owedUsd)}`);
      const detail = [
        `${client.unpaidKg} kg`,
        `${client.salesCount} venta${client.salesCount === 1 ? '' : 's'}`,
        `desde ${formatDate(client.oldestSaleDate)}`,
      ];
      if (client.overdueCount > 0) detail.push(`⚠️ ${client.overdueCount} vencida${client.overdueCount === 1 ? '' : 's'}`);
      lines.push(`   ${detail.join(' · ')}`);
    }

    if (receivables.clients.length > 10) {
      lines.push(`\n_y ${receivables.clients.length - 10} más. Escribe su nombre para buscarlo._`);
    }

    lines.push('');
    lines.push('Toca un cliente para ver el detalle, o escribe su nombre para buscarlo.');

    return {
      text: lines.join('\n'),
      // Only rows with a real client: "Sin cliente" has no id to look up.
      buttons: shown
        .filter((client) => client.clientId)
        .map((client) => ({
          id: buildButtonId(BUTTON.CLIENT_SALES, client.clientId as string),
          title: `👤 ${client.clientName}`,
          description: `${formatUsd(client.owedUsd)} pendiente`,
        })),
    };
  }

  /** One client's pending sales, in full — the report "Cobrar" opens onto. */
  async clientSales(companyId: string, clientId: string): Promise<OutgoingMessage> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { name: true },
    });
    if (!client) return { text: 'Ese cliente ya no existe.' };

    const sales = await this.clientResolver.pendingSales(companyId, clientId);
    if (sales.length === 0) {
      return { text: `✅ *${client.name}* no debe nada. Todas sus ventas están cobradas.` };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalOwed = round2(
      sales.reduce((sum, sale) => sum + (Number(sale.totalAmount) - Number(sale.paidAmount)), 0),
    );

    const lines = [`🔎 *${client.name}* debe *${formatUsd(totalOwed)}*`, ''];
    for (const sale of sales) {
      const balance = round2(Number(sale.totalAmount) - Number(sale.paidAmount));
      const overdue = sale.dueDate && sale.dueDate < today ? ' · ⚠️ vencida' : '';
      const kind = sale.saleType === 'dead' ? 'beneficiado' : 'vivo';
      lines.push(`▸ *${sale.code ?? '—'}* · ${formatDate(sale.saleDate)} · ${sale.quantity} ${kind}${overdue}`);
      lines.push(`   ${formatUsd(balance)} pendiente de ${formatUsd(Number(sale.totalAmount))}`);
    }

    lines.push('', 'Mándame la captura del pago y lo aplico a la venta más vieja.');
    return { text: lines.join('\n') };
  }

  private async overview(companyId: string): Promise<OutgoingMessage> {
    const [receivables, overdue, payables] = await Promise.all([
      this.reports.getReceivablesByClient(companyId),
      this.reports.getOverdueSales(companyId),
      this.payables.listOpen(companyId),
    ]);

    const owedToUs = receivables.totals.owedUsd;
    const weOwe = round2(payables.reduce((sum, payable) => sum + payable.balance, 0));

    const lines = [
      '📊 *Cómo vas*',
      '',
      `Te deben: *${formatUsd(owedToUs)}*` +
        (receivables.totals.owedBs !== null ? ` (${formatBs(receivables.totals.owedBs)})` : ''),
      `  ${receivables.clients.length} cliente${receivables.clients.length === 1 ? '' : 's'} · ${receivables.totals.unpaidKg} kg sin cobrar`,
      '',
      `Debes: *${formatBs(weOwe)}*`,
      `  ${payables.length} operación${payables.length === 1 ? '' : 'es'} sin pagar`,
    ];

    if (overdue.length > 0) {
      lines.push('');
      lines.push(`⚠️ *${overdue.length} venta${overdue.length === 1 ? '' : 's'} vencida${overdue.length === 1 ? '' : 's'}*`);
      for (const sale of overdue.slice(0, 5)) {
        lines.push(
          `▸ ${sale.clientName} · ${formatUsd(sale.balance)} · ${sale.daysOverdue} día${sale.daysOverdue === 1 ? '' : 's'}`,
        );
      }
    }

    return { text: lines.join('\n') };
  }

  private async balances(companyId: string): Promise<OutgoingMessage> {
    const accounts = await this.accounts.findAll(companyId);
    if (accounts.length === 0) {
      return { text: 'No tienes cuentas registradas. Agrégalas en Tesorería.' };
    }

    const lines = ['🏦 *Saldos*', ''];
    const totals = new Map<string, number>();

    for (const account of accounts) {
      const balance = Number(account.currentBalance);
      totals.set(account.currency, (totals.get(account.currency) ?? 0) + balance);
      const shown = account.currency === 'USD' ? formatUsd(balance) : formatBs(balance);
      lines.push(`▸ *${account.name}* · ${shown}`);
    }

    if (accounts.length > 1) {
      lines.push('');
      for (const [currency, total] of totals) {
        lines.push(`Total ${currency}: *${currency === 'USD' ? formatUsd(total) : formatBs(total)}*`);
      }
    }

    return { text: lines.join('\n') };
  }

  private async batches(
    companyId: string,
    _channel: string,
    _externalUserId: string,
  ): Promise<OutgoingMessage> {
    const batches = await this.prisma.batch.findMany({
      where: { companyId, status: { not: 'finished' } },
      include: {
        warehouse: { select: { name: true } },
        // Only the ones still waiting: a confirmed batch keeps its lines around
        // with `processed: true`, and counting those would promise purchases
        // that were already made.
        entryLines: { where: { processed: false } },
        // Deaths come from the daily logs: `initial - current` also counts the
        // birds that were sold.
        dailyLogs: { select: { mortality: true } },
      },
      orderBy: { startDate: 'desc' },
      take: 10,
    });

    const lines =
      batches.length === 0 ? ['No tienes lotes activos.'] : ['🐣 *Lotes activos*', ''];

    for (const batch of batches) {
      const dead = batch.dailyLogs.reduce((sum, log) => sum + log.mortality, 0);
      lines.push(`▸ *${batch.code ?? batch.breed}* · ${BATCH_STATUS_LABELS[batch.status] ?? batch.status}`);
      lines.push(
        `   ${batch.currentQuantity} de ${batch.initialQuantity} aves${dead > 0 ? ` · ${dead} de baja` : ''} · ${batch.warehouse.name}`,
      );
      if (batch.status === 'planned' && batch.entryLines.length > 0) {
        const total = linesTotal(batch.entryLines);
        lines.push(
          `   ${batch.entryLines.length} compra${batch.entryLines.length === 1 ? '' : 's'} por registrar` +
            (total > 0 ? ` · ${formatBs(total)}` : ''),
        );
      }
    }

    const planned = batches.filter((batch) => batch.status === 'planned');
    if (planned.length > 0) {
      lines.push('');
      lines.push('_Confirma un lote cuando lleguen los pollitos: ahí es cuando se registran sus compras._');
    }

    return { text: lines.join('\n'), buttons: this.batchActions(batches) };
  }

  /** What you can do from the batch screen, given what is on it. */
  private batchActions(
    batches: Array<{ id: string; code: string | null; breed: string; status: string }>,
  ): OutgoingMessage['buttons'] {
    const buttons: NonNullable<OutgoingMessage['buttons']> = [];

    // Confirming comes first because it is the one thing with a deadline: the
    // chicks are already in the shed and nothing is on the books until you say so.
    const planned = batches.filter((batch) => batch.status === 'planned');
    if (planned.length === 1) {
      buttons.push({
        id: buildButtonId(BUTTON.BATCH_CONFIRM, planned[0].id),
        title: `✅ Confirmar ${planned[0].code ?? planned[0].breed}`,
      });
    } else if (planned.length > 1) {
      buttons.push({
        id: buildButtonId(BUTTON.BATCH_PICK, 'all'),
        title: '✅ Confirmar un lote',
        description: `${planned.length} planificados`,
      });
    }

    buttons.push({ id: buildButtonId(BUTTON.FORM, 'batch_plan'), title: '➕ Planificar lote' });
    buttons.push({ id: buildButtonId(BUTTON.FORM, 'entry'), title: '📦 Registrar compra' });

    // Only offered when there is something to slaughter, so the operation never
    // opens onto an empty list.
    if (batches.some((batch) => batch.status === 'for_sale')) {
      buttons.push({ id: buildButtonId(BUTTON.FORM, 'processing'), title: '🔪 Registrar beneficio' });
    }

    return buttons;
  }

  /** The planned batches, when there is more than one to choose between. */
  async plannedBatchPicker(companyId: string): Promise<OutgoingMessage> {
    const planned = await this.prisma.batch.findMany({
      where: { companyId, status: 'planned' },
      include: { warehouse: { select: { name: true } } },
      orderBy: { startDate: 'asc' },
      take: 9,
    });

    if (planned.length === 0) return { text: 'No tienes lotes planificados.' };

    return {
      text: '¿Cuál llegó?\n\n_Confirmarlo lo pasa a crianza y registra sus compras._',
      buttons: [
        ...planned.map((batch) => ({
          id: buildButtonId(BUTTON.BATCH_CONFIRM, batch.id),
          title: `🐣 ${batch.code ?? batch.breed}`,
          description: `${batch.initialQuantity} ${batch.breed} · ${batch.warehouse.name}`,
        })),
        // Without this row the screen is a dead end: nine batches and no way
        // out other than confirming one.
        { id: buildButtonId(BUTTON.MENU, 'batches'), title: '✖️ Ninguno' },
      ],
    };
  }

  /**
   * What confirming this batch is about to do, before it does it.
   *
   * `planned → breeding` is one-way and books every planned purchase as a real
   * expense, so it gets a second tap. Reading back what will be written is also
   * the only chance to notice a saco with the wrong price.
   */
  async confirmBatchPrompt(companyId: string, batchId: string): Promise<OutgoingMessage | null> {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
      include: {
        warehouse: { select: { name: true } },
        entryLines: { where: { processed: false }, include: { product: { select: { name: true } } } },
      },
    });
    if (!batch) return null;

    if (batch.status !== 'planned') {
      return {
        text: `*${batch.code ?? batch.breed}* ya está en ${(
          BATCH_STATUS_LABELS[batch.status] ?? batch.status
        ).toLowerCase()}. No hay nada que confirmar.`,
      };
    }

    const lines = [
      `🐣 *${batch.code ?? batch.breed}*`,
      `${batch.initialQuantity} ${batch.breed} · ${batch.warehouse.name}`,
      '',
    ];

    if (batch.entryLines.length === 0) {
      lines.push('No tiene compras cargadas, así que solo pasa a crianza.');
      lines.push('_El costo de los pollitos no quedará registrado como gasto._');
    } else {
      lines.push('Al confirmar registro estas compras y su gasto:');
      for (const line of batch.entryLines) {
        const cost = lineTotal(line);
        lines.push(
          `▸ ${line.product.name} × ${Number(line.quantity)}` + (cost > 0 ? ` · ${formatBs(cost)}` : ''),
        );
      }
      const total = linesTotal(batch.entryLines);
      if (total > 0) lines.push('', `Total ${formatBs(total)} · queda por pagar`);
    }

    lines.push('', '¿Ya llegaron los pollitos?');

    return {
      text: lines.join('\n'),
      buttons: [
        { id: buildButtonId(BUTTON.BATCH_CONFIRM, batch.id, 'ok'), title: '✅ Sí, llegaron' },
        { id: buildButtonId(BUTTON.MENU, 'batches'), title: '✖️ Todavía no' },
      ],
    };
  }

  /**
   * Confirms the batch: to breeding, with its purchases received.
   *
   * All of it happens inside `updateStatus`, in one transaction, and each line
   * is marked `processed` as it goes — so a second tap finds nothing left to
   * register rather than doubling the stock and the expense.
   */
  async confirmBatch(companyId: string, batchId: string): Promise<OutgoingMessage | null> {
    const before = await this.prisma.batch.findFirst({
      where: { id: batchId, companyId },
      select: { id: true, code: true, breed: true, status: true },
    });
    if (!before) return null;
    if (before.status !== 'planned') {
      return { text: `*${before.code ?? before.breed}* ya estaba confirmado.` };
    }

    try {
      await this.batchesService.updateStatus(companyId, batchId, 'breeding');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Batch ${batchId} failed to confirm: ${message}`);
      return { text: `⚠️ No pude confirmarlo: ${message}` };
    }

    const owed = (await this.payables.listOpen(companyId, { kind: 'entry' })).filter(
      (payable) => payable.batchId === batchId,
    );

    const lines = [`✅ *${before.code ?? before.breed}* entró a crianza`];

    if (owed.length === 0) {
      lines.push('', 'Ya puedes registrarle el día a día.');
      return { text: lines.join('\n') };
    }

    const total = owed.reduce((sum, payable) => sum + payable.balance, 0);
    lines.push('', `Quedaron ${owed.length} compra${owed.length === 1 ? '' : 's'} por pagar:`);
    for (const payable of owed.slice(0, 5)) {
      lines.push(`▸ *${payable.code ?? payable.description}* · ${formatBs(payable.balance)}`);
    }
    if (owed.length > 5) lines.push(`_y ${owed.length - 5} más._`);

    lines.push('', `Total ${formatBs(round2(total))}`);
    lines.push(
      owed.length === 1
        ? `📸 Mándame ahora la captura del pago y la aplico a ${owed[0].code ?? 'esa compra'}.`
        : '📸 Mándame las capturas de los pagos y las aplico a estas compras.',
    );

    return { text: lines.join('\n') };
  }
}

/**
 * Bolivares a planned line will cost once it becomes a real purchase.
 *
 * The same arithmetic `BatchesService` does on confirmation, so what the screen
 * promises and what gets written are the same number.
 */
function lineTotal(line: PlannedLine): number {
  return round2(
    Number(line.quantity) * Number(line.costPerUnit ?? 0) + Number(line.deliveryCost ?? 0),
  );
}

function linesTotal(lines: PlannedLine[]): number {
  return round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
}

function formatDate(value: Date | string): string {
  const iso = typeof value === 'string' ? value : value.toISOString();
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
