import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { rankByName } from './fuzzy.util';

/** Above this a single candidate is used without asking. */
const CONFIDENT_MATCH = 0.85;
/** Below this a candidate is not offered at all. */
const PLAUSIBLE_MATCH = 0.6;

export interface ClientMatch {
  id: string;
  name: string;
  score: number;
}

export interface ClientResolution {
  /** Chosen automatically; null when nothing plausible matched. */
  match: ClientMatch | null;
  /** Runner-up, offered as the third button when the top match is not certain. */
  alternative: ClientMatch | null;
  /** True when no client matched and one would have to be created. */
  isNew: boolean;
  warnings: string[];
}

export interface ClientNameMatch {
  id: string;
  name: string;
  score: number;
}

@Injectable()
export class ClientResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Maps the name printed on a receipt to a client.
   *
   * Never creates anything: a new client is only written when the draft is
   * confirmed, so a receipt you discard leaves no trace in the client list.
   */
  async resolve(companyId: string, rawName: string | null): Promise<ClientResolution> {
    if (!rawName || rawName.trim().length < 2) {
      return { match: null, alternative: null, isNew: false, warnings: [] };
    }

    const clients = await this.prisma.client.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    const ranked = rankByName(rawName, clients, (c) => c.name)
      .filter((r) => r.score >= PLAUSIBLE_MATCH)
      .map((r) => ({ id: r.item.id, name: r.item.name, score: r.score }));

    if (ranked.length === 0) {
      return {
        match: null,
        alternative: null,
        isNew: true,
        warnings: [`Cliente nuevo: "${rawName.trim()}" se creará al confirmar`],
      };
    }

    const [best, second] = ranked;
    const warnings: string[] = [];

    if (best.score < CONFIDENT_MATCH) {
      warnings.push(`Interpreté "${rawName.trim()}" como ${best.name}`);
    }

    // Only offer an alternative when the top two are genuinely close; a clear
    // winner should not cost a button.
    const alternative = second && best.score - second.score < 0.15 ? second : null;

    return { match: best, alternative, isNew: false, warnings };
  }

  /** Open sales for a client, oldest first — that is the order a payment applies in. */
  async pendingSales(companyId: string, clientId: string) {
    return this.prisma.sale.findMany({
      where: { companyId, clientId, paymentStatus: { in: ['pending', 'partial'] } },
      orderBy: { saleDate: 'asc' },
      select: {
        id: true,
        code: true,
        saleDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        saleType: true,
        quantity: true,
      },
    });
  }

  /**
   * Every client whose name plausibly matches what was typed, best first.
   *
   * For free-text search (the "cobrar" menu, mainly) — not a receipt guess, so
   * there is no `isNew`/auto-pick here: the caller decides what to do with zero,
   * one or several candidates.
   */
  async searchByName(companyId: string, rawName: string): Promise<ClientNameMatch[]> {
    const query = rawName.trim();
    if (query.length < 2) return [];

    const clients = await this.prisma.client.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    return rankByName(query, clients, (c) => c.name)
      .filter((r) => r.score >= PLAUSIBLE_MATCH)
      .slice(0, 5)
      .map((r) => ({ id: r.item.id, name: r.item.name, score: r.score }));
  }
}
