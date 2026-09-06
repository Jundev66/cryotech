import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { textSearchWhere } from '../../common/search/search.util';
import { rankByName } from '../../common/search/fuzzy.util';
import type { ClientInput } from '@cryotech/shared-types';

const SEARCH_FIELDS = ['name', 'phone', 'email', 'code'];

/** How many rows the fuzzy pass is willing to pull into memory. */
const FUZZY_SCAN_CAP = 500;

/**
 * Looser than the 0.6 the bot uses to auto-assign a client.
 *
 * There the score decides on its own; here it only offers a list to somebody
 * who is looking at the screen, so a near miss costs nothing and a missing row
 * costs a retype.
 */
const PLAUSIBLE_MATCH = 0.45;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
  ) {}

  async findAll(companyId: string, filters?: { search?: string; limit?: number }) {
    const query = filters?.search?.trim();

    const rows = await this.prisma.client.findMany({
      where: { companyId, ...textSearchWhere(query, SEARCH_FIELDS) },
      orderBy: { name: 'asc' },
      ...(filters?.limit ? { take: filters.limit } : {}),
    });

    if (rows.length > 0 || !query || query.length < 3) return rows;

    // Nothing matched literally. "jose" for "José", "gonzales" for "González":
    // Postgres ignores case but not accents, and an empty table tells the user
    // the client does not exist, which is the opposite of what happened. Only
    // runs on a search that was about to render nothing anyway.
    const candidates = await this.prisma.client.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      take: FUZZY_SCAN_CAP,
    });

    return rankByName(query, candidates, (client) => client.name)
      .filter((scored) => scored.score >= PLAUSIBLE_MATCH)
      .slice(0, filters?.limit ?? 20)
      .map((scored) => scored.item);
  }

  async findOne(companyId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, companyId },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(companyId: string, input: ClientInput) {
    const code = await this.sequenceService.next(companyId, 'client');

    return this.prisma.client.create({
      data: {
        companyId,
        code,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email || null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  async update(companyId: string, clientId: string, input: Partial<ClientInput>) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, companyId },
    });
    if (!client) throw new NotFoundException('Client not found');

    return this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email || null }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
  }

  async remove(companyId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, companyId },
    });
    if (!client) throw new NotFoundException('Client not found');

    await this.prisma.client.delete({ where: { id: clientId } });
    return { success: true };
  }
}
