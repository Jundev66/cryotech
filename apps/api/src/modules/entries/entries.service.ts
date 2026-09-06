import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, type TransactionType, type EntryStatus, type PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { textSearchWhere } from '../../common/search/search.util';
import { SequenceService } from '../../common/services/sequence.service';
import { transactionCategoryForSlug } from '../../common/constants/category-mapping';
import { PayablesService } from '../payables/payables.service';
import type { ProductEntryInput } from '@cryotech/shared-types';
import type { RegisterPayablePaymentInput } from '../payables/payables.types';

/** A purchase payment: a payable payment whose payable is already known. */
export type EntryPaymentInput = Omit<RegisterPayablePaymentInput, 'kind' | 'payableId'>;

@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly payables: PayablesService,
  ) {}

  async findAll(
    companyId: string,
    filters?: {
      productId?: string;
      batchId?: string;
      status?: EntryStatus;
      paymentStatus?: PaymentStatus;
      search?: string;
    },
  ) {
    return this.prisma.productEntry.findMany({
      where: {
        companyId,
        ...(filters?.productId && { productId: filters.productId }),
        ...(filters?.batchId && { batchId: filters.batchId }),
        ...(filters?.status && { status: filters.status }),
        ...(filters?.paymentStatus && { paymentStatus: filters.paymentStatus }),
        ...textSearchWhere(filters?.search, [
          'code',
          'supplierName',
          'notes',
          'product.name',
          'batch.breed',
        ]),
      },
      include: {
        product: { include: { category: true, measurementUnit: true } },
        batch: { select: { id: true, breed: true, status: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
      orderBy: { entryDate: 'desc' },
    });
  }

  async findOne(companyId: string, entryId: string) {
    const entry = await this.prisma.productEntry.findFirst({
      where: { id: entryId, companyId },
      include: {
        product: { include: { category: true, measurementUnit: true } },
        batch: { select: { id: true, breed: true, status: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!entry) throw new NotFoundException('Entrada no encontrada');
    return entry;
  }

  async create(companyId: string, input: ProductEntryInput & { supplierName?: string }) {
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, companyId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // The batch too, not just the product. The `where` on every query protects
    // us from reading someone else's data, but not from *pointing* at it:
    // without this, a purchase of this company could be charged to another
    // company's batch, polluting its costs and confirming the UUID exists.
    if (input.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: input.batchId, companyId },
      });
      if (!batch) throw new NotFoundException('Lote no encontrado');
    }

    return this.prisma.$transaction(async (tx) => {
      // Inside the transaction so a failed create does not burn the code.
      const code = await this.sequenceService.next(companyId, 'entry', tx);

      return tx.productEntry.create({
        data: {
          companyId,
          code,
          productId: input.productId,
          batchId: input.batchId ?? null,
          quantity: input.quantity,
          totalCost: input.totalCost ?? null,
          costPerUnit: input.totalCost ? input.totalCost / input.quantity : null,
          deliveryCost: input.deliveryCost ?? null,
          supplierName: input.supplierName ?? null,
          status: 'pending',
          entryDate: new Date(input.entryDate),
          notes: input.notes ?? null,
        },
        include: {
          product: { include: { category: true, measurementUnit: true } },
          batch: { select: { id: true, breed: true, status: true } },
          payments: true,
        },
      });
    });
  }

  /**
   * Receives the goods: moves stock and recognises the expense.
   *
   * Deliberately says nothing about money having been paid — that is
   * `registerPayment`. Receiving on credit and paying in advance are both
   * normal, and conflating them is what made it impossible to know what you
   * still owe.
   */
  async receive(companyId: string, entryId: string) {
    const entry = await this.prisma.productEntry.findFirst({
      where: { id: entryId, companyId },
      include: { product: { include: { category: true } } },
    });
    if (!entry) throw new NotFoundException('Entrada no encontrada');
    if (entry.status === 'received') {
      throw new BadRequestException('Esta entrada ya fue recibida');
    }

    return this.prisma.$transaction((tx) => this.receiveWithin(tx, companyId, entryId));
  }

  /** Shared with the batch confirmation flow, which receives several at once. */
  async receiveWithin(tx: Prisma.TransactionClient, companyId: string, entryId: string) {
    const entry = await tx.productEntry.findFirstOrThrow({
      where: { id: entryId, companyId },
      include: { product: { include: { category: true } } },
    });

    const updated = await tx.productEntry.update({
      where: { id: entryId },
      data: { status: 'received' },
      include: {
        product: { include: { category: true, measurementUnit: true } },
        batch: { select: { id: true, breed: true, status: true } },
        payments: true,
      },
    });

    await tx.product.update({
      where: { id: entry.productId },
      data: { currentStock: { increment: entry.quantity } },
    });

    const productCost = entry.totalCost ? Number(entry.totalCost) : 0;
    const deliveryCost = entry.deliveryCost ? Number(entry.deliveryCost) : 0;
    const totalExpense = productCost + deliveryCost;

    if (totalExpense > 0) {
      const txCode = await this.sequenceService.next(companyId, 'transaction', tx);
      await tx.transaction.create({
        data: {
          companyId,
          code: txCode,
          batchId: entry.batchId,
          type: 'expense' as TransactionType,
          category: transactionCategoryForSlug(entry.product.category?.slug),
          amount: totalExpense,
          description: `Entrada recibida: ${entry.product.name} x ${entry.quantity}${deliveryCost > 0 ? ` (incl. envio: Bs ${deliveryCost.toFixed(2)})` : ''}`,
          sourceType: 'entry',
          sourceId: entryId,
          // The expense belongs to the day the goods arrived, not to whenever
          // the button happened to be pressed.
          transactionDate: entry.entryDate,
        },
      });
    }

    return updated;
  }

  /**
   * Records money paid against a purchase.
   *
   * A purchase is just one kind of payable, so the work lives in
   * `PayablesService` alongside processings — same rules, one implementation.
   * Works before or after receiving, which is what makes an advance payment
   * representable.
   */
  async registerPayment(companyId: string, entryId: string, input: EntryPaymentInput) {
    return this.payables.registerPayment(companyId, {
      ...input,
      kind: 'entry',
      payableId: entryId,
    });
  }

  async getPayments(companyId: string, entryId: string) {
    return this.payables.getPayments(companyId, 'entry', entryId);
  }

  async remove(companyId: string, entryId: string) {
    const entry = await this.prisma.productEntry.findFirst({
      where: { id: entryId, companyId },
      include: { payments: { select: { id: true } } },
    });
    if (!entry) throw new NotFoundException('Entrada no encontrada');
    if (entry.status === 'received') {
      throw new BadRequestException('No se puede eliminar una entrada recibida');
    }
    if (entry.payments.length > 0) {
      throw new BadRequestException(
        'No se puede eliminar una entrada con pagos registrados. Anule los pagos primero.',
      );
    }

    await this.prisma.productEntry.delete({ where: { id: entryId } });
    return { success: true };
  }
}
