import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { ProcessedStockService } from '../../../common/services/processed-stock.service';
import { CHICKS_CATEGORY_SLUG } from '../../../common/constants/category-mapping';
import { formatAmount, formatUsd, todayIn } from '../formatting/number.format';
import { CALENDAR_FUTURE_DAYS, CALENDAR_PAST_DAYS, type FlowKind } from './flow.catalog';

const DEFAULT_TIMEZONE = 'America/Caracas';
/** WhatsApp caps a Dropdown at 200 rows; well under it keeps the form usable. */
const MAX_OPTIONS = 50;
/** Standard price per kilo, shown as a hint so it need not be looked up. */
const DEFAULT_PRICE_PER_KG = 4;

interface Option {
  id: string;
  title: string;
  description?: string;
}

export interface FlowPayload {
  /** What the form is rendered with. Goes out with the message. */
  data: Record<string, unknown>;
  /**
   * What those options meant, kept on the session.
   *
   * A submission only sends back ids. Recording what was offered is what lets
   * the answer be trusted without a second round of lookups — and what catches
   * an id that was never on the list.
   */
  context: Record<string, unknown>;
  /**
   * Answers the wizard starts with already filled in.
   *
   * A question with exactly one possible answer is not a question. Seeding it
   * skips the step, because the wizard walks to the first key nobody has
   * answered — so this is how "which chick product?" disappears on a farm that
   * only has one, and how it stays gone on a farm that has none.
   *
   * Native forms ignore this: they arrive complete or not at all.
   */
  seedAnswers?: Record<string, string>;
  /** Set when the form cannot be opened at all, e.g. no active batches. */
  blocked?: string;
}

/**
 * Fills the forms in.
 *
 * WhatsApp Flows in `navigate` mode have no server to call back into, so
 * everything a form displays has to travel with the message. That is a feature
 * here: one outbound message, no endpoint to host, no public URL.
 */
@Injectable()
export class FlowDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly processedStock: ProcessedStockService,
    private readonly configService: ConfigService,
  ) {}

  async build(companyId: string, kind: FlowKind): Promise<FlowPayload> {
    const dates = this.calendarBounds(kind);

    switch (kind) {
      case 'sale':
        return this.saleData(companyId, dates);
      case 'daily_log':
        return this.dailyLogData(companyId, dates);
      case 'processing':
        return this.processingData(companyId, dates);
      case 'batch_plan':
        return this.batchPlanData(companyId, dates);
      case 'entry':
        return this.entryData(companyId, dates);
    }
  }

  /**
   * What a sale needs, which comes from two different places.
   *
   * Live birds sit in the batch; processed ones have already left it and live
   * in the processed inventory. Requiring a batch with live birds closed the
   * whole sale when the only stock left was processed — which is exactly how
   * every cycle ends.
   */
  private async saleData(companyId: string, dates: DateBounds): Promise<FlowPayload> {
    const [clients, live, attributable, processed] = await Promise.all([
      this.clientsByRelevance(companyId),
      this.sellableBatches(companyId),
      this.recentBatches(companyId),
      this.processedStock.available(companyId),
    ]);

    if (live.options.length === 0 && processed <= 0) {
      return {
        data: {},
        context: {},
        blocked:
          'No tienes aves vivas en ningún lote ni pollo beneficiado en inventario, así que no hay nada que vender.',
      };
    }
    if (clients.length === 0) {
      return {
        data: {},
        context: {},
        blocked: 'No tienes clientes registrados. Agrega uno en la web y vuelve a intentarlo.',
      };
    }

    const clientOptions: Option[] = clients;

    // Processed stock is still charged to a batch, but that batch may be at
    // zero, so each option shows what **that** batch has left. Showing the
    // company total next to every batch claimed stock that was not there.
    const perBatch = await this.processedByBatch(companyId);
    const withStock = attributable.filter((option) => (perBatch.get(option.id) ?? 0) > 0);

    // If the inventory holds birds no batch accounts for — history loaded by
    // hand — they are still offered: the stock exists and has to be sellable.
    const processedBatches: Option[] =
      processed <= 0
        ? []
        : (withStock.length > 0 ? withStock : attributable).map((option) => {
            const own = perBatch.get(option.id) ?? 0;
            return {
              ...option,
              description:
                own > 0
                  ? `${own} beneficiados de este lote`
                  : `${processed} beneficiados en inventario`,
            };
          });

    // Only what can actually be sold: offering "Vivo" with no live birds leads
    // to an empty list and no way back.
    const saleTypes: Option[] = [];
    if (live.options.length > 0) {
      saleTypes.push({ id: 'live', title: '🐔 Vivo', description: 'Del lote, en pie' });
    }
    if (processedBatches.length > 0) {
      saleTypes.push({
        id: 'dead',
        title: '🔪 Beneficiado',
        description: `${processed} en inventario`,
      });
    }

    return {
      // `data` travels to Meta and must match exactly what the screen declares
      // — one extra key and the send is rejected. `context` stays on this side,
      // which is where the assistant reads from.
      data: {
        ...dates,
        clients: clientOptions,
        batches: live.options,
        price_hint: `Precio habitual: $${formatAmount(DEFAULT_PRICE_PER_KG)} por kg`,
      },
      context: { clients: clientOptions, batches: live.options, processedBatches, saleTypes },
    };
  }

  /**
   * Processed birds left per batch: the ones taken out minus the ones sold.
   *
   * Processed inventory is a single company-wide number, so this is the only
   * way to tell which batch each bird came from. It is used to display and to
   * sort; the real inventory still caps a sale, and the API validates that.
   */
  private async processedByBatch(companyId: string): Promise<Map<string, number>> {
    const [processed, sold] = await Promise.all([
      this.prisma.processing.groupBy({
        by: ['batchId'],
        where: { companyId },
        _sum: { quantity: true },
      }),
      this.prisma.sale.groupBy({
        by: ['batchId'],
        where: { companyId, saleType: 'dead' },
        _sum: { quantity: true },
      }),
    ]);

    const remaining = new Map<string, number>();
    for (const row of processed) {
      remaining.set(row.batchId, Number(row._sum.quantity ?? 0));
    }
    for (const row of sold) {
      if (!row.batchId) continue;
      remaining.set(row.batchId, (remaining.get(row.batchId) ?? 0) - Number(row._sum.quantity ?? 0));
    }
    return remaining;
  }

  /**
   * Batches a sale can be charged to, with live birds or without.
   *
   * A slaughter emptied the batch weeks ago and the meat is still in the
   * freezer: the sale belongs to that batch anyway, because that is where the
   * cost came from.
   */
  private async recentBatches(companyId: string): Promise<Option[]> {
    const batches = await this.prisma.batch.findMany({
      where: { companyId, status: { in: ['breeding', 'for_sale', 'finished'] } },
      orderBy: { startDate: 'desc' },
      take: 10,
      include: { warehouse: { select: { name: true } } },
    });

    return batches.map((batch) => ({
      id: batch.id,
      title: batch.code ?? batch.breed,
      description: `${batch.currentQuantity} aves vivas · ${batch.warehouse.name}`,
    }));
  }

  private async dailyLogData(companyId: string, dates: DateBounds): Promise<FlowPayload> {
    const batches = await this.prisma.batch.findMany({
      where: { companyId, status: { in: ['breeding', 'for_sale'] } },
      orderBy: { startDate: 'desc' },
      take: MAX_OPTIONS,
      select: { id: true, code: true, breed: true, currentQuantity: true, startDate: true },
    });

    if (batches.length === 0) {
      return { data: {}, context: {}, blocked: 'No tienes lotes en crianza.' };
    }

    const options: Option[] = batches.map((batch) => ({
      id: batch.id,
      title: batch.code ?? batch.breed,
      description: `${batch.currentQuantity} aves · día ${daysSince(batch.startDate)}`,
    }));

    return { data: { ...dates, batches: options }, context: { batches: options } };
  }

  private async processingData(companyId: string, dates: DateBounds): Promise<FlowPayload> {
    const [batches, rate] = await Promise.all([
      this.prisma.batch.findMany({
        where: { companyId, status: 'for_sale', currentQuantity: { gt: 0 } },
        orderBy: { startDate: 'desc' },
        take: MAX_OPTIONS,
        select: { id: true, code: true, breed: true, currentQuantity: true },
      }),
      this.exchangeRates.getCurrentRate(companyId),
    ]);

    if (batches.length === 0) {
      return { data: {}, context: {}, blocked: 'No tienes lotes listos para beneficiar.' };
    }

    const options: Option[] = batches.map((batch) => ({
      id: batch.id,
      title: batch.code ?? batch.breed,
      description: `${batch.currentQuantity} aves listas`,
    }));

    // Shown, not used for arithmetic: the form travels with the message and the
    // rate ages while it is being filled in, so the conversion happens on the
    // way back with a fresh rate.
    const rateHint = rate.unavailable
      ? 'Sin tasa BCV disponible ahora mismo'
      : `BCV de hoy: ${formatAmount(rate.effectiveRate as number)} Bs por dólar`;

    return {
      data: { ...dates, batches: options, rate_hint: rateHint },
      context: { batches: options },
    };
  }

  private async batchPlanData(companyId: string, dates: DateBounds): Promise<FlowPayload> {
    const [warehouses, previous, products, chicks] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
        take: MAX_OPTIONS,
        select: { id: true, name: true, capacity: true },
      }),
      // Breeds you have actually raised, so the list is yours rather than a
      // catalogue of everything that exists.
      this.prisma.batch.findMany({
        where: { companyId },
        distinct: ['breed'],
        orderBy: { startDate: 'desc' },
        take: 10,
        select: { breed: true },
      }),
      this.productOptions(companyId),
      // Chicks are half of what raising a batch costs and never reached the
      // books: `purchasePricePerUnit` was stored and nobody turned it into an
      // expense. As a supply line it does, and there is a payable to settle.
      this.productOptions(companyId, { categorySlug: CHICKS_CATEGORY_SLUG }),
    ]);

    if (warehouses.length === 0) {
      return { data: {}, context: {}, blocked: 'No tienes galpones registrados.' };
    }

    const warehouseOptions: Option[] = warehouses.map((warehouse) => ({
      id: warehouse.id,
      title: warehouse.name,
      description: warehouse.capacity ? `Capacidad ${warehouse.capacity}` : 'Sin capacidad definida',
    }));

    const breeds = previous.map((batch) => batch.breed);
    for (const fallback of ['Cobb 500', 'Ross 308']) {
      if (!breeds.includes(fallback)) breeds.push(fallback);
    }
    const breedOptions: Option[] = breeds.slice(0, MAX_OPTIONS).map((breed) => ({
      id: breed,
      title: breed,
    }));

    // Asking "which chick?" with one possible answer makes the user tap the
    // only option there was; with none it is a dead end.
    const seedAnswers: Record<string, string> = {};
    if (chicks.length <= 1) seedAnswers.chick_product = chicks[0]?.id ?? '';
    // No products, no supplies to load, so there is nothing to offer.
    if (products.length === 0) seedAnswers.add_supplies = 'no';

    return {
      data: { ...dates, warehouses: warehouseOptions, breeds: breedOptions },
      context: {
        warehouses: warehouseOptions,
        breeds: breedOptions,
        products,
        chickProducts: chicks,
      },
      seedAnswers,
    };
  }

  private async entryData(companyId: string, dates: DateBounds): Promise<FlowPayload> {
    const [productOptions, batches] = await Promise.all([
      this.productOptions(companyId),
      this.prisma.batch.findMany({
        where: { companyId, status: { in: ['planned', 'breeding', 'for_sale'] } },
        orderBy: { startDate: 'desc' },
        take: MAX_OPTIONS - 1,
        select: { id: true, code: true, breed: true, currentQuantity: true },
      }),
    ]);

    if (productOptions.length === 0) {
      return { data: {}, context: {}, blocked: 'No tienes productos registrados.' };
    }

    // A purchase does not have to belong to a batch — electricity and bags do
    // not — so "no batch" is an option rather than a missing answer.
    const batchOptions: Option[] = [
      { id: 'none', title: 'Sin lote', description: 'Gasto general de la granja' },
      ...batches.map((batch) => ({
        id: batch.id,
        title: batch.code ?? batch.breed,
        description: `${batch.currentQuantity} aves`,
      })),
    ];

    return {
      data: { ...dates, products: productOptions, batches: batchOptions },
      context: { products: productOptions, batches: batchOptions },
    };
  }

  /**
   * The products you can buy, with what you already have of each.
   *
   * Shared by the purchase form and the batch plan, which now loads supplies
   * too — the same list either way, so a saco reads the same wherever it is
   * picked from.
   */
  private async productOptions(
    companyId: string,
    filters?: { categorySlug?: string },
  ): Promise<Option[]> {
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        ...(filters?.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
      },
      orderBy: { name: 'asc' },
      take: MAX_OPTIONS,
      include: { measurementUnit: { select: { abbreviation: true } } },
    });

    return products.map((product) => ({
      id: product.id,
      title: product.name,
      description: `Existencia: ${Number(product.currentStock)}${
        product.measurementUnit?.abbreviation ? ` ${product.measurementUnit.abbreviation}` : ''
      }`,
    }));
  }

  /**
   * Clients in the order you are likely to want them: whoever owes you first.
   *
   * Alphabetical looks tidy and is useless — a list of ten rows means selling to
   * Zulay costs three taps of "Ver más" every single time. The people with an
   * open balance are the ones you are actually still doing business with, and
   * there are far fewer of them, so they fit on the first page.
   */
  private async clientsByRelevance(companyId: string): Promise<Option[]> {
    const clients = await this.prisma.client.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      take: MAX_OPTIONS,
      select: {
        id: true,
        name: true,
        sales: {
          where: { paymentStatus: { in: ['pending', 'partial'] } },
          select: { totalAmount: true, paidAmount: true },
        },
      },
    });

    return clients
      .map((client) => {
        const owed = client.sales.reduce(
          (sum, sale) => sum + Number(sale.totalAmount) - Number(sale.paidAmount),
          0,
        );
        return {
          id: client.id,
          name: client.name,
          owed: Math.round(owed * 100) / 100,
        };
      })
      .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name, 'es'))
      .map((client) => ({
        id: client.id,
        title: client.name,
        // Saying what they owe turns picking a client into a reminder.
        description: client.owed > 0 ? `Debe ${formatUsd(client.owed)}` : undefined,
      }));
  }

  private async sellableBatches(companyId: string) {
    const batches = await this.prisma.batch.findMany({
      where: { companyId, status: { in: ['breeding', 'for_sale'] }, currentQuantity: { gt: 0 } },
      orderBy: { startDate: 'desc' },
      take: MAX_OPTIONS,
      include: { warehouse: { select: { name: true } } },
    });

    return {
      options: batches.map((batch) => ({
        id: batch.id,
        title: batch.code ?? batch.breed,
        description: `${batch.currentQuantity} aves · ${batch.warehouse.name}`,
      })) satisfies Option[],
      length: batches.length,
    };
  }

  /** The window the calendar allows, in the farm's own timezone. */
  private calendarBounds(kind: FlowKind): DateBounds {
    const timeZone = this.configService.get<string>('ASSISTANT_TIMEZONE') ?? DEFAULT_TIMEZONE;
    const today = todayIn(timeZone);
    return {
      min_date: shiftDays(today, -CALENDAR_PAST_DAYS),
      max_date: shiftDays(today, CALENDAR_FUTURE_DAYS[kind]),
    };
  }
}

interface DateBounds {
  min_date: string;
  max_date: string;
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysSince(date: Date): number {
  const ms = Date.now() - date.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
