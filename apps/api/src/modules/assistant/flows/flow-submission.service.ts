import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { BotFlowSession } from '@prisma/client';
import { SalesService } from '../../sales/sales.service';
import { DailyLogsService } from '../../daily-logs/daily-logs.service';
import { BatchesService } from '../../batches/batches.service';
import { EntriesService } from '../../entries/entries.service';
import { ProcessingService } from '../../processing/processing.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { formatBs, formatUsd, parseLocalNumber } from '../formatting/number.format';
import type { OutgoingMessage } from '../types/assistant.types';
import { isFlowKind, type FlowKind } from './flow.catalog';

/** What a form sends back: every value arrives as a string. */
type Submission = Record<string, unknown>;

interface OptionRef {
  id: string;
  title: string;
}

/** A purchase planned against a batch, made real when the batch is confirmed. */
interface EntryLineInput {
  productId: string;
  quantity: number;
  costPerUnit?: number;
  deliveryCost?: number;
}

/**
 * Turns a submitted form into records.
 *
 * Everything goes through the same services the web uses, so a sale filed from
 * a phone is indistinguishable from one filed at a desk — same validation, same
 * sequence codes, same treasury linkage.
 */
@Injectable()
export class FlowSubmissionService {
  private readonly logger = new Logger(FlowSubmissionService.name);

  constructor(
    private readonly sales: SalesService,
    private readonly dailyLogs: DailyLogsService,
    private readonly batches: BatchesService,
    private readonly entries: EntriesService,
    private readonly processing: ProcessingService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async execute(
    session: BotFlowSession,
    submission: Submission,
  ): Promise<{ reply: OutgoingMessage; resultType: string; resultId: string | null }> {
    if (!isFlowKind(session.flowKind)) {
      throw new BadRequestException(`Formulario desconocido: ${session.flowKind}`);
    }

    switch (session.flowKind as FlowKind) {
      case 'sale':
        return this.registerSale(session, submission);
      case 'daily_log':
        return this.registerDailyLog(session, submission);
      case 'processing':
        return this.registerProcessing(session, submission);
      case 'batch_plan':
        return this.planBatch(session, submission);
      case 'entry':
        return this.registerEntry(session, submission);
    }
  }

  private async registerSale(session: BotFlowSession, submission: Submission) {
    // Both lists: the assistant offers one or the other by sale type.
    const batchId = this.pickOption(session, ['batches', 'processedBatches'], submission.batch);
    const saleType = this.pickOneOf(submission.sale_type, ['live', 'dead'], 'tipo de venta');
    const pricePerKg = this.positiveNumber(submission.price_per_kg, 'precio por kg');
    const saleDate = this.date(submission.sale_date, 'fecha');
    const paid = submission.payment === 'paid';

    // Everything parked with "Otro cliente", plus the one on screen — if there
    // is one. Closing a run from the client question parks the last sale and
    // leaves that question unanswered, so appending it there would try to book
    // a sale with no client.
    const parked = this.cartOf(session);
    const pending = submission.client ? [submission] : [];

    const rows = [...parked, ...pending].map((row) => {
      const quantity = this.positiveInt(row.quantity, 'cantidad de aves');
      const weightKg = this.positiveNumber(row.weight_kg, 'kilos');
      return {
        clientId: this.pickOption(session, 'clients', row.client),
        saleType,
        quantity,
        weightKg,
        pricePerKg,
        totalAmount: round2(weightKg * pricePerKg),
      };
    });

    // A run goes through `createMany`, which adds up the quantities before it
    // writes anything — a loop of `create` would let each row pass its own
    // check and oversell the batch between them.
    if (rows.length > 1) {
      const sales = await this.sales.createMany(session.companyId, {
        batchId,
        saleDate,
        items: rows,
      });

      const totalAmount = rows.reduce((sum, row) => sum + row.totalAmount, 0);
      const totalBirds = rows.reduce((sum, row) => sum + row.quantity, 0);
      const lines = [
        `✅ ${sales.length} ventas registradas`,
        ...sales.map((sale) => `▸ ${sale.code ?? ''} ${sale.client?.name ?? ''}`.trim()),
        `${totalBirds} aves · ${formatUsd(round2(totalAmount))} en total`,
        paid
          ? 'Mándame las capturas de los pagos y registro los cobros.'
          : 'Quedan fiadas. Cuando te paguen, mándame la captura y la aplico.',
      ];

      return {
        reply: { text: lines.join('\n') },
        resultType: 'sale',
        resultId: sales[0]?.id ?? null,
      };
    }

    const [only] = rows;
    const sale = await this.sales.create(session.companyId, {
      batchId,
      clientId: only.clientId,
      saleType,
      quantity: only.quantity,
      weightKg: only.weightKg,
      pricePerKg,
      totalAmount: only.totalAmount,
      saleDate,
    });

    // A sale marked "paid" still needs the money booked, and a form cannot say
    // which account it landed in. Say so rather than silently leaving it owing.
    const lines = [
      `✅ Venta registrada ${sale.code ?? ''}`.trim(),
      `${only.quantity} aves · ${only.weightKg} kg · ${formatUsd(only.totalAmount)}`,
    ];
    lines.push(
      paid
        ? 'Mándame la captura del pago para registrar el cobro y moverlo en tesorería.'
        : 'Queda fiada. Cuando te paguen, mándame la captura y la aplico.',
    );

    return { reply: { text: lines.join('\n') }, resultType: 'sale', resultId: sale.id };
  }

  /** The sales parked by "Otro cliente", still unwritten. */
  private cartOf(session: BotFlowSession): Submission[] {
    return this.parkedIn(session, 'cart');
  }

  /** Rows the wizard parked while the user added another, in whichever bucket. */
  private parkedIn(session: BotFlowSession, bucket: string): Submission[] {
    const context = (session.context ?? {}) as Record<string, unknown>;
    const rows = context[bucket];
    return Array.isArray(rows) ? (rows as Submission[]) : [];
  }

  private async registerDailyLog(session: BotFlowSession, submission: Submission) {
    const batchId = this.pickOption(session, 'batches', submission.batch);
    const logDate = this.date(submission.log_date, 'fecha');
    const mortality = this.nonNegativeInt(submission.mortality, 'aves muertas');

    const log = await this.dailyLogs.create(session.companyId, {
      batchId,
      logDate,
      mortality,
      feedConsumedKg: this.optionalNumber(submission.feed_consumed_kg),
      averageWeightG: this.optionalNumber(submission.average_weight_g),
      waterConsumedL: this.optionalNumber(submission.water_consumed_l),
    });

    const detail = [`${mortality} muerta${mortality === 1 ? '' : 's'}`];
    const feed = this.optionalNumber(submission.feed_consumed_kg);
    const weight = this.optionalNumber(submission.average_weight_g);
    if (feed !== undefined) detail.push(`${feed} kg de alimento`);
    if (weight !== undefined) detail.push(`${weight} g de peso`);

    return {
      reply: { text: `✅ Día registrado · ${logDate}\n${detail.join(' · ')}` },
      resultType: 'daily_log',
      resultId: log.id,
    };
  }

  private async registerProcessing(session: BotFlowSession, submission: Submission) {
    const batchId = this.pickOption(session, 'batches', submission.batch);
    const quantity = this.positiveInt(submission.quantity, 'aves beneficiadas');
    const isSelfProcessed = submission.who === 'self';
    const processingDate = this.date(submission.processing_date, 'fecha');
    const totalCostBs = isSelfProcessed ? 0 : this.positiveNumber(submission.total_cost_bs, 'costo total');

    // The form asks in bolivares because that is what the invoice says; the
    // dollar figure is derived here, with a rate read now rather than the one
    // that was current when the form was sent.
    const rate = await this.exchangeRates.getCurrentRate(session.companyId);
    if (totalCostBs > 0 && (rate.unavailable || !rate.effectiveRate)) {
      throw new BadRequestException('No hay tasa BCV disponible para convertir el costo');
    }
    const exchangeRate = rate.unavailable ? undefined : (rate.effectiveRate as number);
    const totalCost = exchangeRate ? round2(totalCostBs / exchangeRate) : 0;

    const created = await this.processing.create(session.companyId, {
      batchId,
      quantity,
      isSelfProcessed,
      totalCost,
      totalCostBs,
      exchangeRate,
      supplierName: this.optionalText(submission.supplier_name),
      liveWeightKg: this.optionalNumber(submission.live_weight_kg),
      processedWeightKg: this.optionalNumber(submission.processed_weight_kg),
      processingDate,
      weightAdjustmentG: 0,
    });

    const lines = [`✅ Beneficio registrado ${created.code ?? ''}`.trim(), `${quantity} aves`];
    if (totalCostBs > 0) {
      lines.push(`Costo ${formatBs(totalCostBs)} · queda por pagar`);
      lines.push('Mándame la captura del pago y lo aplico a este beneficio.');
    }

    return { reply: { text: lines.join('\n') }, resultType: 'processing', resultId: created.id };
  }

  private async planBatch(session: BotFlowSession, submission: Submission) {
    const warehouseId = this.pickOption(session, 'warehouses', submission.warehouse);
    const breed = this.pickOption(session, 'breeds', submission.breed);
    const initialQuantity = this.positiveInt(submission.initial_quantity, 'cantidad de pollitos');
    const startDate = this.date(submission.start_date, 'fecha de entrada');
    const pricePerChick = this.optionalNumber(submission.price_per_chick);

    const entryLines: EntryLineInput[] = [];

    // Chicks first. Without this line the per-chick price was stored and never
    // reached the books: no expense, no payable, and nothing for the receipt of
    // half the batch's cost to settle against.
    const chickProduct = this.optionalText(submission.chick_product);
    if (chickProduct && pricePerChick) {
      entryLines.push({
        productId: this.pickOption(session, 'chickProducts', chickProduct),
        quantity: initialQuantity,
        costPerUnit: pricePerChick,
      });
    }

    // The supplies parked with "Agregar otro", plus the one left on screen —
    // which does not exist if the user said they bought none.
    const parked = this.parkedIn(session, 'supplies');
    const pending = submission.supply_product ? [submission] : [];
    for (const row of [...parked, ...pending]) {
      entryLines.push({
        productId: this.pickOption(session, 'products', row.supply_product),
        quantity: this.positiveNumber(row.supply_quantity, 'cantidad del insumo'),
        // Unit cost exactly as asked. Deriving it from a total by dividing
        // booked Bs 2,899.98 where the user had written Bs 2,900.
        costPerUnit: this.positiveNumber(row.supply_cost, 'costo del insumo'),
        deliveryCost: this.optionalNumber(row.supply_delivery),
      });
    }

    const batch = await this.batches.create(session.companyId, {
      warehouseId,
      breed,
      startDate,
      initialQuantity,
      purchasePricePerUnit: pricePerChick,
      entryLines: entryLines.length > 0 ? entryLines : undefined,
    });

    const lines = [
      `✅ Lote planificado ${batch.code ?? ''}`.trim(),
      `${initialQuantity} ${breed} · entrada ${startDate}`,
    ];

    const planned = round2(
      entryLines.reduce(
        (sum, line) => sum + line.quantity * (line.costPerUnit ?? 0) + (line.deliveryCost ?? 0),
        0,
      ),
    );
    if (entryLines.length > 0) {
      lines.push(
        `${entryLines.length} compra${entryLines.length === 1 ? '' : 's'} cargada${
          entryLines.length === 1 ? '' : 's'
        } · ${formatBs(planned)}`,
      );
    } else if (pricePerChick) {
      lines.push(`Costo estimado ${formatBs(round2(initialQuantity * pricePerChick))}`);
    }

    lines.push('');
    lines.push('Cuando lleguen los pollitos, confírmalo desde 🐣 Lotes.');
    if (entryLines.length > 0) {
      lines.push('_Ahí se registran esas compras y su gasto, y ahí te pido el comprobante._');
    } else if (pricePerChick) {
      // Say it rather than swallow it: the price was stored and the batch will
      // still be confirmed with no expense and no payable, which is what made
      // half the cost of raising invisible.
      lines.push('_Ojo: el costo de los pollitos no quedará como gasto._');
      lines.push('_Hace falta un producto en la categoría Pollos Bebé para poder cargarlo._');
    } else {
      lines.push('_Sin compras cargadas, confirmarlo solo lo pasa a crianza._');
    }

    return { reply: { text: lines.join('\n') }, resultType: 'batch', resultId: batch.id };
  }

  private async registerEntry(session: BotFlowSession, submission: Submission) {
    const productId = this.pickOption(session, 'products', submission.product);
    const rawBatch = String(submission.batch ?? '');
    const batchId = rawBatch === 'none' ? undefined : this.pickOption(session, 'batches', rawBatch);
    const quantity = this.positiveNumber(submission.quantity, 'cantidad');
    const totalCost = this.positiveNumber(submission.total_cost, 'costo total');
    const entryDate = this.date(submission.entry_date, 'fecha');

    const entry = await this.entries.create(session.companyId, {
      productId,
      batchId,
      quantity,
      totalCost,
      deliveryCost: this.optionalNumber(submission.delivery_cost),
      entryDate,
      supplierName: this.optionalText(submission.supplier_name),
    });

    // Receiving is what recognises the expense and moves stock. Paying is a
    // separate act, and the receipt is what will carry it.
    if (submission.received === 'yes') {
      await this.entries.receive(session.companyId, entry.id);
    }

    const lines = [
      `✅ Compra registrada ${entry.code ?? ''}`.trim(),
      `${quantity} × ${entry.product?.name ?? 'producto'} · ${formatBs(totalCost)}`,
    ];
    lines.push(
      submission.received === 'yes'
        ? 'Ya entró al inventario y quedó como gasto. Falta pagarla.'
        : 'Queda pendiente de recibir.',
    );
    // Code first: the receipt sent next lands on this purchase without having
    // to look for it in a list.
    lines.push('');
    lines.push(
      entry.code
        ? `📸 Mándame ahora la captura del pago y la aplico a ${entry.code}.`
        : '📸 Mándame ahora la captura del pago y la aplico a esta compra.',
    );

    return { reply: { text: lines.join('\n') }, resultType: 'entry', resultId: entry.id };
  }

  // --- Parsing --------------------------------------------------------------
  //
  // Everything arrives as a string, from a client we do not control. So every
  // id is checked against what was actually offered, and every number is
  // validated here rather than trusted into a service.

  /** An id is only accepted if it was one of the options the form was sent. */
  /**
   * An id is only accepted if it was one of the options this session offered.
   *
   * Takes more than one key because a question can be fed from different lists
   * depending on earlier answers — selling live birds lists batches that have
   * some, selling processed ones lists whatever the slaughtered stock can be
   * attributed to. Checking a single fixed key rejected a perfectly good answer
   * with "esa opción ya no está disponible", which reads like the data changed
   * when in fact the wrong list was being consulted.
   *
   * The union is still exactly what was sent, so nothing unoffered gets in.
   */
  private pickOption(session: BotFlowSession, keys: string | string[], raw: unknown): string {
    const candidates = Array.isArray(keys) ? keys : [keys];
    const value = String(raw ?? '').trim();
    if (!value) throw new BadRequestException(`Falta seleccionar ${candidates[0]}`);

    const context = (session.context ?? {}) as Record<string, unknown>;
    const offered = candidates
      .map((key) => context[key])
      .filter(Array.isArray)
      .flat() as OptionRef[];

    // Nothing was recorded for any of them: an older session, or a form whose
    // list is not ours to police. Let it through and let the service validate.
    if (offered.length === 0) return value;

    const match = offered.find((option) => option?.id === value);
    if (!match) {
      this.logger.warn(
        `Flow ${session.flowKind} submitted an id that was never offered: ${value} (buscado en ${candidates.join(', ')})`,
      );
      throw new BadRequestException('Esa opción ya no está disponible. Abre el formulario otra vez.');
    }
    return match.id;
  }

  private pickOneOf<T extends string>(raw: unknown, allowed: readonly T[], label: string): T {
    const value = String(raw ?? '').trim() as T;
    if (!allowed.includes(value)) throw new BadRequestException(`Falta seleccionar ${label}`);
    return value;
  }

  /**
   * A calendar answer, normalised to `yyyy-mm-dd`.
   *
   * CalendarPicker has sent both an ISO date and epoch milliseconds depending on
   * the client version, so both are accepted rather than betting on one.
   */
  private date(raw: unknown, label: string): string {
    const value = String(raw ?? '').trim();
    if (!value) throw new BadRequestException(`Falta la ${label}`);

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    if (/^\d{10,}$/.test(value)) {
      const millis = Number(value);
      const parsed = new Date(millis);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

    throw new BadRequestException(`No entendí la ${label}: "${value}"`);
  }

  private positiveNumber(raw: unknown, label: string): number {
    const value = this.optionalNumber(raw);
    if (value === undefined || value <= 0) {
      throw new BadRequestException(`${capitalize(label)} debe ser mayor que cero`);
    }
    return value;
  }

  private positiveInt(raw: unknown, label: string): number {
    const value = this.positiveNumber(raw, label);
    if (!Number.isInteger(value)) {
      throw new BadRequestException(`${capitalize(label)} debe ser un número entero`);
    }
    return value;
  }

  private nonNegativeInt(raw: unknown, label: string): number {
    const value = this.optionalNumber(raw) ?? 0;
    if (value < 0 || !Number.isInteger(value)) {
      throw new BadRequestException(`${capitalize(label)} debe ser un número entero`);
    }
    return value;
  }

  /** An empty field means "not given"; the rest is `parseLocalNumber`'s problem. */
  private optionalNumber(raw: unknown): number | undefined {
    return parseLocalNumber(raw as string) ?? undefined;
  }

  private optionalText(raw: unknown): string | undefined {
    const text = String(raw ?? '').trim();
    return text === '' ? undefined : text;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
