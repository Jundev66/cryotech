import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TRANSACTION_CATEGORY_LABELS } from '@cryotech/shared-types';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReportsService } from '../../reports/reports.service';
import { PayablesService } from '../../payables/payables.service';
import { AccountsService } from '../../treasury/accounts.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { ChannelRegistryService } from '../inbound/channel-registry.service';
import { normalizeExternalId } from '../inbound/identity.service';
import { formatAmount, formatBs, formatUsd, todayIn } from '../formatting/number.format';
import type { OutgoingMessage } from '../types/assistant.types';

const DEFAULT_TIMEZONE = 'America/Caracas';
/** The channel that can message first. WhatsApp needs a paid template outside the 24 h window. */
const PUSH_CHANNEL = 'telegram';
/** Owner capital moves cash but is not a result of the business. */
const CAPITAL_CATEGORIES = new Set(['capital_in', 'owner_draw']);

/**
 * The messages nobody has to ask for.
 *
 * Every figure here could already be looked up — the debtors, the balances,
 * the rate — but only by someone who remembers to. A summary that arrives on
 * its own is what turns "I should check who owes me" into knowing it.
 *
 * Built from the same services the menu and the web read, so the numbers here
 * never disagree with what the user sees when they tap through.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly payables: PayablesService,
    private readonly accounts: AccountsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly registry: ChannelRegistryService,
    private readonly configService: ConfigService,
  ) {}

  async sendDaily(): Promise<void> {
    const target = this.target();
    if (!target) return;
    await this.broadcast(target.chats, await this.daily(target.companyId));
  }

  async sendWeekly(): Promise<void> {
    const target = this.target();
    if (!target) return;
    await this.broadcast(target.chats, await this.weekly(target.companyId));
  }

  /** Today's rate on its own, for the `tasa` shortcut. */
  async rate(companyId: string): Promise<OutgoingMessage> {
    const rate = await this.exchangeRates.getCurrentRate(companyId);
    if (rate.unavailable) {
      return { text: '💱 No tengo tasa BCV disponible ahora mismo.' };
    }
    const day = rate.rateDate.toISOString().slice(0, 10);
    return {
      text:
        `💱 *BCV: ${formatAmount(rate.effectiveRate)} Bs por dólar*\n` +
        `_Del ${shortDate(day)}${rate.stale ? ', desactualizada: hoy no se pudo leer del BCV' : ''}_\n\n` +
        `$1 = ${formatBs(rate.effectiveRate)} · $100 = ${formatBs(round2(rate.effectiveRate * 100))}`,
    };
  }

  /** What happened today, what is in each account, and what needs chasing. */
  async daily(companyId: string): Promise<OutgoingMessage> {
    const todayIso = todayIn(this.timeZone());
    const today = dateOnly(todayIso);
    const tomorrow = dateOnly(shiftDays(todayIso, 1));

    const [rate, sales, payments, expenses, accounts, overdue, dueTomorrow, waiting, receivables] = await Promise.all([
      this.exchangeRates.getCurrentRate(companyId),
      this.prisma.sale.findMany({
        where: { companyId, saleDate: today },
        select: { totalAmount: true, paidAmount: true, weightKg: true, quantity: true },
      }),
      this.prisma.salePayment.findMany({
        where: { companyId, paymentDate: today },
        select: { amount: true, amountBs: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['category'],
        where: { companyId, type: 'expense', transactionDate: today },
        _sum: { amount: true },
      }),
      this.accounts.findAll(companyId),
      this.reports.getOverdueSales(companyId),
      this.prisma.sale.findMany({
        where: { companyId, paymentStatus: { in: ['pending', 'partial'] }, dueDate: tomorrow },
        select: { totalAmount: true, paidAmount: true, client: { select: { name: true } } },
      }),
      this.prisma.botDraft.count({
        where: { companyId, status: 'pending', expiresAt: { gt: new Date() } },
      }),
      this.reports.getReceivablesByClient(companyId),
    ]);

    const lines = [`📅 *Resumen de hoy* · ${shortDate(todayIso)}`];
    if (!rate.unavailable) {
      lines.push(`💱 BCV ${formatAmount(rate.effectiveRate)} Bs/$${rate.stale ? ' _(desactualizada)_' : ''}`);
    }
    lines.push('');

    if (sales.length > 0) {
      const total = round2(sum(sales.map((sale) => Number(sale.totalAmount))));
      const owed = round2(sum(sales.map((sale) => Number(sale.totalAmount) - Number(sale.paidAmount))));
      const kg = round2(sum(sales.map((sale) => Number(sale.weightKg ?? 0))));
      const birds = sum(sales.map((sale) => sale.quantity));
      lines.push(`🧾 Ventas: *${formatUsd(total)}* · ${sales.length} · ${birds} aves · ${formatAmount(kg)} kg`);
      if (owed > 0) lines.push(`   quedan por cobrar ${formatUsd(owed)}`);
    } else {
      lines.push('🧾 Ventas: ninguna');
    }

    if (payments.length > 0) {
      const usd = round2(sum(payments.map((payment) => Number(payment.amount))));
      const bs = round2(sum(payments.map((payment) => Number(payment.amountBs ?? 0))));
      lines.push(`💰 Cobros: *${formatUsd(usd)}*${bs > 0 ? ` (${formatBs(bs)})` : ''}`);
    } else {
      lines.push('💰 Cobros: ninguno');
    }

    const operating = expenses.filter((row) => !CAPITAL_CATEGORIES.has(row.category));
    const draws = expenses.filter((row) => row.category === 'owner_draw');
    if (operating.length > 0) {
      const totalBs = round2(sum(operating.map((row) => Number(row._sum.amount ?? 0))));
      lines.push(`💸 Gastos: *${formatBs(totalBs)}*${this.inUsd(totalBs, rate)}`);
      for (const row of operating.sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0))) {
        lines.push(`   ▸ ${categoryLabel(row.category)} · ${formatBs(Number(row._sum.amount ?? 0))}`);
      }
    } else {
      lines.push('💸 Gastos: ninguno');
    }
    if (draws.length > 0) {
      lines.push(`🏠 Retiros: ${formatBs(round2(sum(draws.map((row) => Number(row._sum.amount ?? 0)))))}`);
    }

    if (accounts.length > 0) {
      lines.push('', '🏦 *Saldos*');
      for (const account of accounts) {
        const balance = Number(account.currentBalance);
        lines.push(`▸ ${account.name} · ${account.currency === 'USD' ? formatUsd(balance) : formatBs(balance)}`);
      }
    }

    const chase: string[] = [];
    if (receivables.clients.length > 0) {
      chase.push(`👥 *Clientes que deben:* (${formatUsd(receivables.totals.owedUsd)})`);
      for (const client of receivables.clients) {
        const late = client.overdueCount > 0 ? ` · ⚠️ ${client.overdueCount} vencida${client.overdueCount === 1 ? '' : 's'}` : '';
        chase.push(`   ▸ ${client.clientName} · ${formatUsd(client.owedUsd)}${late}`);
      }
    }
    if (overdue.length > 0) {
      const total = round2(sum(overdue.map((sale) => sale.balance)));
      chase.push(`⚠️ *${overdue.length} vencida${overdue.length === 1 ? '' : 's'}* · ${formatUsd(total)}`);
      for (const sale of overdue.slice(0, 5)) {
        chase.push(`   ▸ ${sale.clientName} · ${formatUsd(sale.balance)} · ${sale.daysOverdue} día${sale.daysOverdue === 1 ? '' : 's'}`);
      }
    }
    if (dueTomorrow.length > 0) {
      const total = round2(sum(dueTomorrow.map((sale) => Number(sale.totalAmount) - Number(sale.paidAmount))));
      const names = [...new Set(dueTomorrow.map((sale) => sale.client?.name).filter(Boolean))].slice(0, 4);
      chase.push(`⏰ Vencen mañana: ${formatUsd(total)}${names.length ? ` · ${names.join(', ')}` : ''}`);
    }
    if (waiting > 0) {
      chase.push(`📸 ${waiting} comprobante${waiting === 1 ? '' : 's'} sin clasificar · escribe _pendientes_`);
    }
    if (chase.length > 0) lines.push('', ...chase);

    return { text: lines.join('\n') };
  }

  /** The week in money: what came in, what went out, who owes and what is owed. */
  async weekly(companyId: string): Promise<OutgoingMessage> {
    const todayIso = todayIn(this.timeZone());
    const fromIso = shiftDays(todayIso, -6);

    const [rate, rows, receivables, overdue, payables] = await Promise.all([
      this.exchangeRates.getCurrentRate(companyId),
      this.prisma.transaction.groupBy({
        by: ['type', 'category'],
        where: { companyId, transactionDate: { gte: dateOnly(fromIso), lte: dateOnly(todayIso) } },
        _sum: { amount: true },
      }),
      this.reports.getReceivablesByClient(companyId),
      this.reports.getOverdueSales(companyId),
      this.payables.listOpen(companyId),
    ]);

    const income = rows.filter((row) => row.type === 'income' && !CAPITAL_CATEGORIES.has(row.category));
    const expense = rows.filter((row) => row.type === 'expense' && !CAPITAL_CATEGORIES.has(row.category));
    const draws = rows.filter((row) => row.category === 'owner_draw');

    const incomeBs = round2(sum(income.map((row) => Number(row._sum.amount ?? 0))));
    const expenseBs = round2(sum(expense.map((row) => Number(row._sum.amount ?? 0))));
    const resultBs = round2(incomeBs - expenseBs);

    const lines = [
      `📊 *Resumen de la semana* · ${shortDate(fromIso)} al ${shortDate(todayIso)}`,
      '',
      `💰 Ingresos: *${formatBs(incomeBs)}*${this.inUsd(incomeBs, rate)}`,
      `💸 Gastos: *${formatBs(expenseBs)}*${this.inUsd(expenseBs, rate)}`,
    ];
    for (const row of expense.sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0)).slice(0, 6)) {
      lines.push(`   ▸ ${categoryLabel(row.category)} · ${formatBs(Number(row._sum.amount ?? 0))}`);
    }
    lines.push(`${resultBs >= 0 ? '✅' : '🔻'} Resultado: *${formatBs(resultBs)}*${this.inUsd(resultBs, rate)}`);
    const drawnBs = round2(sum(draws.map((row) => Number(row._sum.amount ?? 0))));
    if (drawnBs > 0) lines.push(`🏠 Retiros del dueño: ${formatBs(drawnBs)}`);
    lines.push('_Ingresos y gastos según su fecha; las compras cuentan al recibirlas._');

    lines.push('');
    if (receivables.clients.length === 0) {
      lines.push('💰 Nadie te debe nada.');
    } else {
      lines.push(
        `💰 *Te deben ${formatUsd(receivables.totals.owedUsd)}*` +
          ` · ${receivables.clients.length} cliente${receivables.clients.length === 1 ? '' : 's'}`,
      );
      for (const client of receivables.clients.slice(0, 10)) {
        const late = client.overdueCount > 0 ? ` · ⚠️ ${client.overdueCount} vencida${client.overdueCount === 1 ? '' : 's'}` : '';
        lines.push(`   ▸ ${client.clientName} · ${formatUsd(client.owedUsd)}${late}`);
      }
      if (overdue.length > 0) {
        lines.push(`   _${overdue.length} venta${overdue.length === 1 ? '' : 's'} vencida${overdue.length === 1 ? '' : 's'} en total_`);
      }
    }

    const owedBs = round2(sum(payables.map((payable) => payable.balance)));
    lines.push(
      '',
      payables.length === 0
        ? '💳 No debes nada a proveedores.'
        : `💳 *Debes ${formatBs(owedBs)}* · ${payables.length} compra${payables.length === 1 ? '' : 's'} o beneficio${payables.length === 1 ? '' : 's'}`,
    );

    return { text: lines.join('\n') };
  }

  /**
   * Who gets the push, and for which company.
   *
   * The same variables the allowlist reads: the people allowed to operate the
   * books are the people who should hear about them, and nobody else.
   */
  private target(): { companyId: string; chats: string[] } | null {
    if (this.configService.get<string>('ASSISTANT_DIGEST_ENABLED') === 'false') return null;

    const companyId = this.configService.get<string>('ASSISTANT_COMPANY_ID');
    const chats = (this.configService.get<string>('ASSISTANT_ALLOWED_TELEGRAM_IDS') ?? '')
      .split(',')
      .map((entry) => normalizeExternalId(entry))
      .filter((entry) => entry.length >= 5);

    if (!companyId || chats.length === 0 || !this.registry.has(PUSH_CHANNEL)) return null;
    return { companyId, chats };
  }

  private async broadcast(chats: string[], message: OutgoingMessage): Promise<void> {
    const sender = this.registry.get(PUSH_CHANNEL);
    for (const chat of chats) {
      try {
        await sender.send(chat, message);
      } catch (error) {
        // One chat that blocked the bot must not cost everyone else their summary.
        this.logger.error(`Digest to chat ending ${chat.slice(-4)} failed: ${(error as Error)?.message}`);
      }
    }
  }

  private inUsd(amountBs: number, rate: { unavailable?: boolean; effectiveRate: number }): string {
    if (rate.unavailable || !rate.effectiveRate || amountBs === 0) return '';
    return ` ≈ ${formatUsd(round2(amountBs / rate.effectiveRate))}`;
  }

  private timeZone(): string {
    return this.configService.get<string>('ASSISTANT_TIMEZONE') ?? DEFAULT_TIMEZONE;
  }
}

function categoryLabel(category: string): string {
  return (TRANSACTION_CATEGORY_LABELS as Record<string, string>)[category] ?? category;
}

/** A DATE column compares against UTC midnight of that calendar day. */
function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
