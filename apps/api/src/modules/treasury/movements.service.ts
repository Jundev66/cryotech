import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type Account, type MovementDirection } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { textSearchWhere } from '../../common/search/search.util';
import { SequenceService } from '../../common/services/sequence.service';
import type {
  AccountMovementInput,
  InternalTransferInput,
  FxTradeInput,
} from '@cryotech/shared-types';

export type MovementSource =
  | 'sale_payment'
  | 'payable_payment'
  | 'transaction'
  | 'fx_trade'
  | 'transfer'
  | 'manual';

export interface RecordMovementInput {
  accountId: string;
  direction: MovementDirection;
  amount: number;
  movementDate?: Date | string;
  reference?: string | null;
  counterparty?: string | null;
  concept?: string | null;
  sourceType?: MovementSource;
  sourceId?: string | null;
  transferGroupId?: string | null;
  notes?: string | null;
}

@Injectable()
export class MovementsService {
  private readonly logger = new Logger(MovementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
  ) {}

  async findAll(
    companyId: string,
    filters?: {
      accountId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      search?: string;
    },
  ) {
    const where: Prisma.AccountMovementWhereInput = {
      companyId,
      ...(textSearchWhere(filters?.search, [
        'reference',
        'counterparty',
        'concept',
        'notes',
        'account.name',
      ]) as Prisma.AccountMovementWhereInput),
    };
    if (filters?.accountId) where.accountId = filters.accountId;
    if (filters?.startDate || filters?.endDate) {
      where.movementDate = {
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        ...(filters.endDate && { lte: new Date(filters.endDate) }),
      };
    }

    return this.prisma.accountMovement.findMany({
      where,
      include: { account: { select: { id: true, name: true, currency: true } } },
      orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
      take: filters?.limit ?? 200,
    });
  }

  /**
   * Records one movement and moves the account balance by the same amount.
   *
   * Pass `tx` when this is part of a larger operation (a sale payment writes a
   * payment row, an income transaction and this movement) so all of it commits
   * or none of it does. Without that, a failure halfway leaves a balance that
   * no longer matches its movements.
   */
  async record(companyId: string, input: RecordMovementInput, tx?: Prisma.TransactionClient) {
    if (tx) return this.recordWithin(tx, companyId, input);
    return this.prisma.$transaction((client) => this.recordWithin(client, companyId, input));
  }

  private async recordWithin(
    tx: Prisma.TransactionClient,
    companyId: string,
    input: RecordMovementInput,
  ) {
    const account = await tx.account.findFirst({ where: { id: input.accountId, companyId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (!account.isActive) throw new BadRequestException(`La cuenta "${account.name}" está inactiva`);

    const amount = this.assertPositive(input.amount);
    const reference = this.normalizeReference(input.reference);

    let movement;
    try {
      movement = await tx.accountMovement.create({
        data: {
          companyId,
          accountId: account.id,
          direction: input.direction,
          amount: new Decimal(amount),
          // The movement is always denominated in the account's own currency;
          // converting between currencies is an FX trade, not a movement.
          currency: account.currency,
          movementDate: this.toDate(input.movementDate),
          reference,
          counterparty: input.counterparty ?? null,
          concept: input.concept ?? null,
          sourceType: input.sourceType ?? 'manual',
          sourceId: input.sourceId ?? null,
          transferGroupId: input.transferGroupId ?? null,
          notes: input.notes ?? null,
        },
      });
    } catch (error) {
      throw await this.translateReferenceConflict(error, companyId, reference);
    }

    const updated = await tx.account.update({
      where: { id: account.id },
      data: {
        currentBalance:
          input.direction === 'in'
            ? { increment: new Decimal(amount) }
            : { decrement: new Decimal(amount) },
      },
    });

    if (updated.currentBalance.lessThan(0)) {
      // Allowed, because refusing would block recording a real payment on an
      // account whose opening balance was never seeded — but it always means
      // something upstream is missing, so it must not pass silently.
      this.logger.warn(
        `Account "${updated.name}" went negative (${updated.currentBalance.toString()}) after movement ${movement.id}`,
      );
    }

    return { movement, balance: updated.currentBalance };
  }

  /** Moves money between two of our own accounts in the same currency. */
  async recordTransfer(companyId: string, input: InternalTransferInput) {
    if (input.fromAccountId === input.toAccountId) {
      throw new BadRequestException('Las cuentas de origen y destino deben ser distintas');
    }

    return this.prisma.$transaction(async (tx) => {
      const [from, to] = await this.loadPair(tx, companyId, input.fromAccountId, input.toAccountId);

      if (from.currency !== to.currency) {
        throw new BadRequestException(
          'Un traslado entre cuentas de distinta moneda es una compra de divisas: use ese registro para conservar la tasa.',
        );
      }

      const groupId = randomUUID();
      const date = this.toDate(input.movementDate);

      const out = await this.recordWithin(tx, companyId, {
        accountId: from.id,
        direction: 'out',
        amount: input.amount,
        movementDate: date,
        reference: input.reference,
        concept: `Traslado a ${to.name}`,
        sourceType: 'transfer',
        transferGroupId: groupId,
        notes: input.notes,
      });

      const into = await this.recordWithin(tx, companyId, {
        accountId: to.id,
        direction: 'in',
        amount: input.amount,
        movementDate: date,
        // Only one leg can carry the bank reference: it is unique per company.
        reference: null,
        concept: `Traslado desde ${from.name}`,
        sourceType: 'transfer',
        transferGroupId: groupId,
        notes: input.notes,
      });

      return { transferGroupId: groupId, out: out.movement, in: into.movement };
    });
  }

  /**
   * Buying or selling currency. Produces an FxTrade plus the two movements and
   * deliberately no Transaction: this moves value between accounts, it is not
   * income or expense. Booking it as an expense would inflate costs and wreck
   * the cost-per-kilo figure.
   */
  async recordFxTrade(companyId: string, input: FxTradeInput) {
    return this.prisma.$transaction(async (tx) => {
      const [from, to] = await this.loadPair(tx, companyId, input.fromAccountId, input.toAccountId);

      if (from.currency === to.currency) {
        throw new BadRequestException(
          'Una compra de divisas requiere cuentas de distinta moneda. Para mover dinero entre cuentas de la misma moneda use un traslado.',
        );
      }

      const amountFrom = this.assertPositive(input.amountFrom);
      const amountTo = this.assertPositive(input.amountTo);
      const groupId = randomUUID();
      const date = this.toDate(input.tradeDate);
      // Rate is always expressed as bolivares per unit of foreign currency,
      // regardless of which side of the trade we are on.
      const rate =
        from.currency === 'VES'
          ? round(amountFrom / amountTo, 4)
          : round(amountTo / amountFrom, 4);

      const code = await this.sequenceService.next(companyId, 'fx_trade', tx);

      const trade = await tx.fxTrade.create({
        data: {
          companyId,
          code,
          tradeDate: date,
          fromAccountId: from.id,
          toAccountId: to.id,
          amountFrom: new Decimal(amountFrom),
          amountTo: new Decimal(amountTo),
          rate: new Decimal(rate),
          notes: input.notes ?? null,
        },
      });

      await this.recordWithin(tx, companyId, {
        accountId: from.id,
        direction: 'out',
        amount: amountFrom,
        movementDate: date,
        reference: input.reference,
        concept: `Compra de divisas @ ${rate}`,
        sourceType: 'fx_trade',
        sourceId: trade.id,
        transferGroupId: groupId,
      });

      await this.recordWithin(tx, companyId, {
        accountId: to.id,
        direction: 'in',
        amount: amountTo,
        movementDate: date,
        reference: null,
        concept: `Compra de divisas @ ${rate}`,
        sourceType: 'fx_trade',
        sourceId: trade.id,
        transferGroupId: groupId,
      });

      return trade;
    });
  }

  async createManual(companyId: string, input: AccountMovementInput) {
    const { movement } = await this.record(companyId, {
      accountId: input.accountId,
      direction: input.direction,
      amount: input.amount,
      movementDate: input.movementDate,
      reference: input.reference,
      counterparty: input.counterparty,
      concept: input.concept,
      notes: input.notes,
      sourceType: 'manual',
    });
    return movement;
  }

  /** True when this bank reference was already booked for this company. */
  async findByReference(companyId: string, reference: string) {
    const normalized = this.normalizeReference(reference);
    if (!normalized) return null;
    return this.prisma.accountMovement.findFirst({
      where: { companyId, reference: normalized },
      include: { account: { select: { id: true, name: true } } },
    });
  }

  /**
   * Recomputes every balance from its movements. Reconciliation tool — the
   * running balance is maintained transactionally, so a mismatch here means a
   * bug, and the report says so rather than silently repairing it.
   */
  async recomputeBalances(companyId: string, apply = false) {
    const accounts = await this.prisma.account.findMany({ where: { companyId } });
    const report: Array<{ id: string; name: string; stored: string; computed: string; drift: string }> = [];

    for (const account of accounts) {
      const sums = await this.prisma.accountMovement.groupBy({
        by: ['direction'],
        where: { accountId: account.id },
        _sum: { amount: true },
      });

      const inflow = sums.find((s) => s.direction === 'in')?._sum.amount ?? new Decimal(0);
      const outflow = sums.find((s) => s.direction === 'out')?._sum.amount ?? new Decimal(0);
      const computed = inflow.minus(outflow);
      const drift = computed.minus(account.currentBalance);

      if (!drift.isZero()) {
        report.push({
          id: account.id,
          name: account.name,
          stored: account.currentBalance.toString(),
          computed: computed.toString(),
          drift: drift.toString(),
        });
        if (apply) {
          await this.prisma.account.update({
            where: { id: account.id },
            data: { currentBalance: computed },
          });
        }
      }
    }

    return { checked: accounts.length, mismatches: report, applied: apply };
  }

  private async loadPair(
    tx: Prisma.TransactionClient,
    companyId: string,
    fromId: string,
    toId: string,
  ): Promise<[Account, Account]> {
    const accounts = await tx.account.findMany({
      where: { companyId, id: { in: [fromId, toId] } },
    });
    const from = accounts.find((a) => a.id === fromId);
    const to = accounts.find((a) => a.id === toId);
    if (!from || !to) throw new NotFoundException('Cuenta no encontrada');
    return [from, to];
  }

  private assertPositive(amount: number): number {
    const value = round(Number(amount), 2);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('El monto debe ser un número positivo');
    }
    return value;
  }

  private normalizeReference(reference?: string | null): string | null {
    if (!reference) return null;
    const digitsAndLetters = reference.trim();
    return digitsAndLetters.length > 0 ? digitsAndLetters : null;
  }

  private toDate(value?: Date | string): Date {
    if (!value) return new Date();
    return value instanceof Date ? value : new Date(value);
  }

  private async translateReferenceConflict(
    error: unknown,
    companyId: string,
    reference: string | null,
  ): Promise<unknown> {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      reference
    ) {
      const existing = await this.prisma.accountMovement.findFirst({
        where: { companyId, reference },
        select: { id: true, movementDate: true, amount: true },
      });
      return new ConflictException(
        existing
          ? `La referencia ${reference} ya está registrada (${existing.movementDate.toISOString().slice(0, 10)}, ${existing.amount.toString()})`
          : `La referencia ${reference} ya está registrada`,
      );
    }
    return error;
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
