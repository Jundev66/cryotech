import { BadRequestException, Injectable } from '@nestjs/common';
import { SalesService } from '../../sales/sales.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { ClientResolver } from '../resolvers/client.resolver';
import { formatBs, formatUsd } from '../formatting/number.format';

export interface AllocationInput {
  clientId: string;
  /** The sale to settle first. Without it, the oldest one. */
  saleId?: string | null;
  amount: number;
  currency: 'USD' | 'VES';
  /** The rate to convert with, when the caller already has the right one. */
  exchangeRate?: number | null;
  accountId?: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
}

export interface AllocatedLine {
  saleId: string;
  code: string | null;
  appliedUsd: number;
  appliedBs: number | null;
  stillOwedUsd: number;
}

export interface AllocationResult {
  lines: AllocatedLine[];
  totalUsd: number;
  totalBs: number | null;
  /** Money beyond everything the client owed. Reported, never applied. */
  leftoverUsd: number;
  rate: number | null;
  /** The payments written, one per line — what an undo has to take back. */
  paymentIds: string[];
}

/**
 * Applies one payment across a client's open sales.
 *
 * The chosen sale first, then the rest oldest first — which is how a running
 * tab gets paid down. Every piece is written in a single transaction, and the
 * last piece takes whatever bolivares are left, so the parts add up to exactly
 * what moved in the bank rather than drifting a bolivar per sale.
 *
 * Shared by the receipt and the cash collection so both spread money the same way.
 */
@Injectable()
export class SalePaymentAllocator {
  constructor(
    private readonly sales: SalesService,
    private readonly clients: ClientResolver,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async apply(companyId: string, input: AllocationInput): Promise<AllocationResult> {
    if (!(input.amount > 0)) throw new BadRequestException('El monto debe ser mayor que cero');

    const pending = await this.clients.pendingSales(companyId, input.clientId);
    if (pending.length === 0) {
      throw new BadRequestException('Ese cliente no tiene ventas pendientes de cobro');
    }

    const ordered = input.saleId
      ? [
          ...pending.filter((sale) => sale.id === input.saleId),
          ...pending.filter((sale) => sale.id !== input.saleId),
        ]
      : pending;
    if (input.saleId && ordered[0]?.id !== input.saleId) {
      throw new BadRequestException('Esa venta ya no está pendiente de cobro');
    }

    let rate = input.exchangeRate ?? null;
    if (!rate) {
      const current = await this.exchangeRates.getCurrentRate(companyId);
      if (!current.unavailable && current.effectiveRate) rate = current.effectiveRate;
    }
    if (input.currency === 'VES' && !rate) {
      throw new BadRequestException('No hay tasa BCV para convertir el cobro a dólares');
    }

    const totalUsd = input.currency === 'USD' ? round2(input.amount) : round2(input.amount / (rate as number));
    const totalBs = input.currency === 'VES' ? round2(input.amount) : rate ? round2(input.amount * rate) : null;

    const lines: AllocatedLine[] = [];
    let leftUsd = totalUsd;
    let leftBs = totalBs;

    for (const sale of ordered) {
      if (leftUsd <= 0) break;
      const balance = round2(Number(sale.totalAmount) - Number(sale.paidAmount));
      if (balance <= 0) continue;

      const appliedUsd = round2(Math.min(leftUsd, balance));
      leftUsd = round2(leftUsd - appliedUsd);

      let appliedBs: number | null = null;
      if (leftBs !== null && rate) {
        appliedBs = leftUsd === 0 ? leftBs : round2(appliedUsd * rate);
        leftBs = round2(leftBs - appliedBs);
      }

      lines.push({
        saleId: sale.id,
        code: sale.code,
        appliedUsd,
        appliedBs,
        stillOwedUsd: round2(balance - appliedUsd),
      });
    }

    const payments = await this.sales.registerPayments(
      companyId,
      lines.map((line, index) => ({
        saleId: line.saleId,
        amount: line.appliedUsd,
        amountBs: line.appliedBs ?? undefined,
        exchangeRate: rate ?? undefined,
        paymentDate: input.paymentDate,
        accountId: input.accountId,
        // A bank reference is unique per company in treasury, so only the first
        // movement carries it; the rest point back to it in their notes.
        reference: index === 0 ? input.reference : undefined,
        notes:
          [
            input.notes,
            lines.length > 1 ? `parte ${index + 1} de ${lines.length}` : null,
            index > 0 && input.reference ? `ref ${input.reference}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      })),
    );

    return {
      lines,
      totalUsd,
      totalBs,
      leftoverUsd: leftUsd,
      rate,
      paymentIds: payments.map((payment) => payment.id),
    };
  }
}

/** The lines of a reply describing where the money went. */
export function describeAllocation(result: AllocationResult, clientName: string | null): string[] {
  const lines = [
    result.lines.length === 1
      ? `✅ Cobro registrado en ${result.lines[0].code ?? 'la venta'}`
      : `✅ Cobro repartido en ${result.lines.length} ventas`,
    `${clientName ? `${clientName} · ` : ''}${formatUsd(result.totalUsd)}` +
      (result.totalBs !== null ? ` (${formatBs(result.totalBs)})` : ''),
  ];

  if (result.lines.length > 1) {
    for (const line of result.lines) {
      lines.push(
        `▸ ${line.code ?? 'Venta'} · ${formatUsd(line.appliedUsd)}` +
          (line.stillOwedUsd > 0 ? ` · queda ${formatUsd(line.stillOwedUsd)}` : ' · pagada'),
      );
    }
  } else {
    const [only] = result.lines;
    lines.push(only.stillOwedUsd > 0 ? `Queda debiendo ${formatUsd(only.stillOwedUsd)} en esa venta.` : 'Esa venta queda pagada.');
  }

  if (result.leftoverUsd > 0) {
    lines.push(`⚠️ Sobran ${formatUsd(result.leftoverUsd)}: ya no debía nada más. No los apliqué.`);
  }
  return lines;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
