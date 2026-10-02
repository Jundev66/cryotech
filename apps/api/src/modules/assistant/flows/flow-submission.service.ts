import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BotFlowSession } from '@prisma/client';
import { TRANSACTION_CATEGORY_LABELS } from '@cryotech/shared-types';
import { SalesService } from '../../sales/sales.service';
import { DailyLogsService } from '../../daily-logs/daily-logs.service';
import { BatchesService } from '../../batches/batches.service';
import { EntriesService } from '../../entries/entries.service';
import { ProcessingService } from '../../processing/processing.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { SalePaymentAllocator, describeAllocation } from '../executors/sale-payment.allocator';
import { formatBs, formatUsd, parseLocalNumber } from '../formatting/number.format';
import type { OutgoingMessage } from '../types/assistant.types';
import { EXPENSE_WIZARD_CATEGORIES } from '../wizard/wizard.catalog';
import { isOperationKind, type OperationKind } from './flow.catalog';

/** Days a sale on credit has before it counts as overdue, unless configured. */
const DEFAULT_CREDIT_DAYS = 7;

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
 * What "Deshacer" has to take back after an operation.
 *
 * Only money the bot booked itself: an expense, or the payments of a
 * collection or of a sale paid on the spot. A sale, a purchase or a daily log
 * is corrected from the web, where it can be looked at first.
 */
export interface UndoPlan {
  transactionIds?: string[];
  paymentIds?: string[];
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
    private readonly transactions: TransactionsService,
    private readonly allocator: SalePaymentAllocator,
    private readonly configService: ConfigService,
  ) {}

  async execute(
    session: BotFlowSession,
    submission: Submission,
  ): Promise<{ reply: OutgoingMessage; resultType: string; resultId: string | null; undo?: UndoPlan }> {
    if (!isOperationKind(session.flowKind)) {
      throw new BadRequestException(`Formulario desconocido: ${session.flowKind}`);
    }

    switch (session.flowKind as OperationKind) {
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
      case 'expense':
        return this.registerExpense(session, submission);
      case 'collect':
        return this.registerCollection(session, submission);
    }
  }

  private async registerSale(session: BotFlowSession, submission: Submission) {
    // Both lists: the assistant offers one or the other by sale type.
    const batchId = this.pickOption(session, ['batches', 'processedBatches'], submission.batch);
    const saleType = this.pickOneOf(submission.sale_type, ['live', 'dead'], 'tipo de venta');
    const pricePerKg = this.positiveNumber(submission.price_per_kg, 'precio por kg');
    const saleDate = this.date(submission.sale_date, 'fecha');
    const paid = submission.payment === 'paid';

    // A paid sale whose account was named gets its payment booked now. A native
    // WhatsApp form never asks, so it lands on "receipt": the old behaviour.
    const paymentAccount = String(submission.payment_account ?? '').trim() || 'receipt';
    const payToAccount =
      paid && paymentAccount !== 'receipt'
        ? this.pickOption(session, 'paymentAccounts', paymentAccount)
        : null;

    // On credit, it falls due after the usual term. With no due date a sale can
    // never be overdue, and the reminders have nothing to remind about.
    const dueDate = paid ? undefined : this.dueDateFor(saleDate);

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
        dueDate,
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
      ];

      // "Deshacer" on a paid run takes back the payments only: the sales stand,
      // and go back to owing.
      let runUndo: UndoPlan | undefined;
      if (payToAccount) {
        const payment = await this.payInFull(session, sales, payToAccount, saleDate);
        lines.push(payment.note);
        if (payment.paymentIds.length > 0) runUndo = { paymentIds: payment.paymentIds };
      } else {
        lines.push(
          paid
            ? 'Mándame las capturas de los pagos y registro los cobros.'
            : `Quedan fiadas hasta el ${shortDay(dueDate as string)}. Cuando te paguen, mándame la captura o toca 💵 Cobro.`,
        );
      }

      return {
        reply: { text: lines.join('\n') },
        resultType: 'sale',
        resultId: sales[0]?.id ?? null,
        undo: runUndo,
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
      dueDate,
    });

    const lines = [
      `✅ Venta registrada ${sale.code ?? ''}`.trim(),
      `${only.quantity} aves · ${only.weightKg} kg · ${formatUsd(only.totalAmount)}`,
    ];

    let undo: UndoPlan | undefined;
    if (payToAccount) {
      const payment = await this.payInFull(session, [sale], payToAccount, saleDate);
      lines.push(payment.note);
      if (payment.paymentIds.length > 0) undo = { paymentIds: payment.paymentIds };
    } else {
      // Paid by transfer: the receipt carries the reference and the account,
      // so it is still the better way in. Say so rather than silently leaving it owing.
      lines.push(
        paid
          ? 'Mándame la captura del pago para registrar el cobro y moverlo en tesorería.'
          : `Queda fiada hasta el ${shortDay(dueDate as string)}. Cuando te paguen, mándame la captura o toca 💵 Cobro.`,
      );
    }

    return { reply: { text: lines.join('\n') }, resultType: 'sale', resultId: sale.id, undo };
  }

  /**
   * Books the full payment of sales that were just created as paid.
   *
   * Never throws. The sales are already written, and a failure thrown from
   * here would put the wizard back on its confirmation screen — where tapping
   * "Registrar" again would create them a second time. So the sale stands and
   * the reply says what is left to do.
   */
  private async payInFull(
    session: BotFlowSession,
    sales: Array<{ id: string; totalAmount: unknown }>,
    accountId: string,
    paymentDate: string,
  ): Promise<{ note: string; paymentIds: string[] }> {
    try {
      const payments = await this.sales.registerPayments(
        session.companyId,
        sales.map((sale) => ({
          saleId: sale.id,
          amount: Number(sale.totalAmount),
          accountId,
          paymentDate,
          notes: 'Pagada al registrar la venta',
        })),
      );
      const where = this.optionTitle(session, ['paymentAccounts'], accountId);
      return {
        note: `💵 Cobro registrado${where ? ` en ${where}` : ''}.`,
        paymentIds: payments.map((payment) => payment.id),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Sale registered but its payment failed: ${message}`);
      return {
        note: `⚠️ La venta quedó registrada, pero no pude registrar el cobro: ${message}\nRegístralo con 💵 Cobro sin captura.`,
        paymentIds: [],
      };
    }
  }

  /**
   * Takes back what an operation registered, from its "Deshacer" button.
   *
   * Payments are voided together, in one transaction, and expenses one by one
   * — an operation only ever carries one kind. A sale paid on the spot keeps
   * the sale: only its payment is undone, and it is left owing.
   */
  async undo(companyId: string, plan: UndoPlan): Promise<string> {
    const lines: string[] = [];

    if (plan.paymentIds?.length) {
      await this.sales.voidPayments(companyId, plan.paymentIds);
      lines.push(
        plan.paymentIds.length === 1
          ? '↩️ Deshice el cobro. La venta vuelve a quedar debiendo.'
          : `↩️ Deshice los ${plan.paymentIds.length} cobros. Las ventas vuelven a quedar debiendo.`,
      );
    }

    for (const transactionId of plan.transactionIds ?? []) {
      const voided = await this.transactions.voidManual(companyId, transactionId);
      lines.push(`↩️ Deshice el registro ${voided.code ?? ''}`.trim() + '.');
    }

    lines.push('_Los saldos de las cuentas quedaron como antes._');
    return lines.join('\n');
  }

  /**
   * A cost with no receipt: cash, a transfer nobody screenshotted, the owner
   * taking money out. Goes through the same service as a web entry, so it
   * converts dollars with the BCV rate and moves the account in one transaction.
   */
  private async registerExpense(session: BotFlowSession, submission: Submission) {
    const category = this.pickOneOf(
      submission.category,
      EXPENSE_WIZARD_CATEGORIES.map((option) => option.id),
      'la categoría',
    );
    const amount = this.positiveNumber(submission.amount, 'monto');
    const currency = this.pickOneOf(submission.currency, ['VES', 'USD'] as const, 'la moneda');
    const accountId = this.accountFrom(session, submission.account, currency);
    const rawBatch = String(submission.batch ?? '').trim();
    const batchId = rawBatch === '' || rawBatch === 'none' ? undefined : this.pickOption(session, 'batches', rawBatch);
    const transactionDate = this.date(submission.expense_date, 'fecha');
    const description = this.optionalText(submission.description);

    const transaction = await this.transactions.create(session.companyId, {
      type: 'expense',
      category,
      amount,
      currency,
      accountId,
      batchId,
      description,
      transactionDate,
    });

    const label = (TRANSACTION_CATEGORY_LABELS as Record<string, string>)[category] ?? category;
    const lines = [
      `✅ ${category === 'owner_draw' ? 'Retiro' : 'Gasto'} registrado ${transaction.code ?? ''}`.trim(),
      `${label} · ${currency === 'USD' ? formatUsd(amount) : formatBs(amount)}`,
    ];
    if (description) lines.push(description);

    const batchTitle = batchId ? this.optionTitle(session, ['batches'], batchId) : null;
    if (batchTitle) lines.push(`Cargado al lote ${batchTitle}`);

    const accountTitle = accountId ? this.optionTitle(session, ['accountsUsd', 'accountsVes'], accountId) : null;
    lines.push(accountTitle ? `Salió de ${accountTitle}` : '_Sin cuenta: no movió ningún saldo._');

    return {
      reply: { text: lines.join('\n') },
      resultType: 'transaction',
      resultId: transaction.id,
      undo: { transactionIds: [transaction.id] },
    };
  }

  /** Money received with no receipt to read — spread over the client's sales. */
  private async registerCollection(session: BotFlowSession, submission: Submission) {
    const clientId = this.pickOption(session, 'debtors', submission.client);
    const rawSale = String(submission.sale ?? '').trim();
    const saleId = rawSale === 'fifo' ? null : this.pickOption(session, `sales_${clientId}`, rawSale);
    const currency = this.pickOneOf(submission.currency, ['VES', 'USD'] as const, 'la moneda');
    const amount = this.positiveNumber(submission.amount, 'monto');
    const accountId = this.accountFrom(session, submission.account, currency);
    const paymentDate = this.date(submission.payment_date, 'fecha');

    const result = await this.allocator.apply(session.companyId, {
      clientId,
      saleId,
      amount,
      currency,
      accountId,
      paymentDate,
      notes: 'Cobro sin comprobante, registrado desde el asistente',
    });

    const lines = describeAllocation(result, this.optionTitle(session, ['debtors'], clientId));
    const accountTitle = accountId ? this.optionTitle(session, ['accountsUsd', 'accountsVes'], accountId) : null;
    lines.push(accountTitle ? `Entró en ${accountTitle}` : '_Sin cuenta: no movió ningún saldo._');

    return {
      reply: { text: lines.join('\n') },
      resultType: 'sale_payment',
      resultId: result.lines[0]?.saleId ?? null,
      undo: { paymentIds: result.paymentIds },
    };
  }

  /** The account a quick operation used, from the list for its currency. "none" is no account. */
  private accountFrom(session: BotFlowSession, raw: unknown, currency: 'VES' | 'USD'): string | undefined {
    const value = String(raw ?? '').trim();
    if (value === '' || value === 'none') return undefined;
    return this.pickOption(session, currency === 'USD' ? 'accountsUsd' : 'accountsVes', value);
  }

  /** The title an id was offered under, for a reply that names things. */
  private optionTitle(session: BotFlowSession, keys: string[], id: string): string | null {
    const context = (session.context ?? {}) as Record<string, unknown>;
    for (const key of keys) {
      const options = context[key];
      if (!Array.isArray(options)) continue;
      const match = (options as OptionRef[]).find((option) => option?.id === id);
      if (match) return match.title;
    }
    return null;
  }

  /** When a sale on credit falls due: the sale date plus the configured term. */
  private dueDateFor(saleDate: string): string {
    const configured = Number(this.configService.get('ASSISTANT_DEFAULT_CREDIT_DAYS') ?? DEFAULT_CREDIT_DAYS);
    const days = Number.isInteger(configured) && configured >= 0 ? configured : DEFAULT_CREDIT_DAYS;
    const date = new Date(`${saleDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
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

/** `2026-09-19` → `19/09`. */
function shortDay(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
