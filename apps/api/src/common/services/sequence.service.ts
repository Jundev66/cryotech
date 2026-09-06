import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ENTITY_PREFIXES: Record<string, string> = {
  batch: 'LOT',
  client: 'CLI',
  entry: 'ENT',
  sale: 'VEN',
  processing: 'BEN',
  product: 'PRD',
  warehouse: 'GAL',
  transaction: 'TRX',
  account: 'CTA',
  fx_trade: 'DIV',
};

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the next sequential code for an entity, e.g. `VEN-2600042`.
   *
   * Pass the surrounding transaction client when the code belongs to a record
   * created inside a `$transaction`. Without it the counter increments on its
   * own connection and a rolled-back transaction still burns the number,
   * leaving permanent gaps in the sequence.
   */
  async next(
    companyId: string,
    entity: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const [code] = await this.nextRange(companyId, entity, 1, tx);
    return code;
  }

  /**
   * Reserves `count` consecutive codes in one go.
   *
   * Asking one at a time is correct — the row lock is already held by the
   * calling transaction, so there is no contention with itself — but it is
   * `count` round trips inside an interactive transaction with a five-second
   * budget. One upsert removes the problem and the arithmetic is the same.
   */
  async nextRange(
    companyId: string,
    entity: string,
    count: number,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    if (count < 1) return [];

    const prefix = ENTITY_PREFIXES[entity] ?? entity.toUpperCase().slice(0, 3);
    const year = new Date().getFullYear().toString().slice(-2);
    const db = tx ?? this.prisma;

    const counter = await db.sequenceCounter.upsert({
      where: { companyId_entity: { companyId, entity } },
      create: { companyId, entity, lastValue: count },
      update: { lastValue: { increment: count } },
    });

    const first = counter.lastValue - count + 1;
    return Array.from(
      { length: count },
      (_, index) => `${prefix}-${year}${(first + index).toString().padStart(5, '0')}`,
    );
  }
}
