import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import {
  normalizeIdentifierValue,
  type AccountInput,
  type AccountUpdateInput,
  type AccountIdentifierInput,
} from '@cryotech/shared-types';

/** What a receipt gives us to recognise one of our own accounts. */
export interface IdentifierLookup {
  last4?: string | null;
  phone?: string | null;
  document?: string | null;
  bankCode?: string | null;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
  ) {}

  async findAll(companyId: string, includeInactive = false) {
    return this.prisma.account.findMany({
      where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
      include: { identifiers: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(companyId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId },
      include: { identifiers: true },
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    return account;
  }

  async create(companyId: string, input: AccountInput) {
    const identifiers = this.normalizeIdentifiers(companyId, input.identifiers ?? []);

    return this.prisma.$transaction(async (tx) => {
      const code = input.code ?? (await this.sequenceService.next(companyId, 'account', tx));

      try {
        return await tx.account.create({
          data: {
            companyId,
            code,
            name: input.name,
            kind: input.kind,
            currency: input.currency,
            notes: input.notes ?? null,
            isActive: input.isActive ?? true,
            currentBalance: 0,
            identifiers: { create: identifiers },
          },
          include: { identifiers: true },
        });
      } catch (error) {
        throw this.translateIdentifierConflict(error);
      }
    });
  }

  async update(companyId: string, accountId: string, input: AccountUpdateInput) {
    await this.findOne(companyId, accountId);

    // Identifiers are replaced wholesale when provided: they are a small set
    // and a partial merge would leave stale entries matching old receipts.
    const identifiers = input.identifiers
      ? this.normalizeIdentifiers(companyId, input.identifiers)
      : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (identifiers) {
        await tx.accountIdentifier.deleteMany({ where: { accountId } });
      }

      try {
        return await tx.account.update({
          where: { id: accountId },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.kind !== undefined && { kind: input.kind }),
            ...(input.currency !== undefined && { currency: input.currency }),
            ...(input.code !== undefined && { code: input.code }),
            ...(input.notes !== undefined && { notes: input.notes }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
            ...(identifiers && { identifiers: { create: identifiers } }),
          },
          include: { identifiers: true },
        });
      } catch (error) {
        throw this.translateIdentifierConflict(error);
      }
    });
  }

  async remove(companyId: string, accountId: string) {
    await this.findOne(companyId, accountId);

    const movements = await this.prisma.accountMovement.count({ where: { accountId } });
    if (movements > 0) {
      throw new BadRequestException(
        `No se puede eliminar una cuenta con ${movements} movimiento(s). Desactívela en su lugar.`,
      );
    }

    await this.prisma.account.delete({ where: { id: accountId } });
    return { success: true };
  }

  /**
   * Finds which of our accounts a receipt refers to.
   *
   * This is what makes direction detection deterministic: if our account is on
   * the origin side money left, if it is on the destination side money came in,
   * and if both sides match it is a transfer between our own accounts.
   * Returns null when nothing matches — never a guess.
   */
  async resolveByIdentifier(companyId: string, lookup: IdentifierLookup) {
    const clauses: Prisma.AccountIdentifierWhereInput[] = [];

    if (lookup.last4) {
      const value = normalizeIdentifierValue('last4', lookup.last4);
      if (value.length === 4) {
        clauses.push({
          kind: 'last4',
          value,
          // A masked 4-digit tail is not unique on its own; pairing it with the
          // bank code makes a false match far less likely. When the receipt
          // does not show a bank code we still accept the tail alone.
          ...(lookup.bankCode ? { OR: [{ bankCode: lookup.bankCode }, { bankCode: null }] } : {}),
        });
      }
    }

    if (lookup.phone) {
      const value = normalizeIdentifierValue('phone', lookup.phone);
      if (value.length === 10) clauses.push({ kind: 'phone', value });
    }

    if (lookup.document) {
      clauses.push({ kind: 'document', value: normalizeIdentifierValue('document', lookup.document) });
    }

    if (clauses.length === 0) return null;

    const identifier = await this.prisma.accountIdentifier.findFirst({
      where: { OR: clauses, account: { companyId, isActive: true } },
      include: { account: true },
    });

    return identifier?.account ?? null;
  }

  /** `companyId` travels on every identifier: it is what scopes the unique index. */
  private normalizeIdentifiers(companyId: string, identifiers: AccountIdentifierInput[]) {
    return identifiers.map((identifier) => ({
      companyId,
      kind: identifier.kind,
      value: normalizeIdentifierValue(identifier.kind, identifier.value),
      bankCode: identifier.bankCode ?? null,
    }));
  }

  private translateIdentifierConflict(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String(error.meta?.target ?? '').includes('kind')
    ) {
      return new ConflictException(
        'Ese identificador ya está asignado a otra de tus cuentas. Dentro de una empresa, un número de cuenta o teléfono solo puede pertenecer a una.',
      );
    }
    return error;
  }
}
