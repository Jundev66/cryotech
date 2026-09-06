import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type BotDraft } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

const DEFAULT_TTL_MINUTES = 30;

export interface CreateDraftInput {
  companyId: string;
  userId?: string | null;
  channel: string;
  externalUserId: string;
  intent: string;
  readerTier?: string | null;
  rawExtraction?: Prisma.InputJsonValue;
  entities: Prisma.InputJsonValue;
  resolved?: Prisma.InputJsonValue;
  warnings?: string[];
}

@Injectable()
export class DraftService {
  private readonly logger = new Logger(DraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Queues a draft.
   *
   * Drafts accumulate rather than superseding each other: sending five
   * screenshots in a row must not silently discard four of them. The bot
   * presents them one at a time, and nothing is lost while you take your time
   * answering.
   */
  async create(input: CreateDraftInput): Promise<BotDraft> {
    const ttl = Number(this.configService.get('ASSISTANT_DRAFT_TTL_MINUTES') ?? DEFAULT_TTL_MINUTES);

    return this.prisma.botDraft.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? null,
        channel: input.channel,
        externalUserId: input.externalUserId,
        intent: input.intent,
        readerTier: input.readerTier ?? null,
        rawExtraction: input.rawExtraction ?? Prisma.JsonNull,
        entities: input.entities,
        resolved: input.resolved ?? Prisma.JsonNull,
        warnings: (input.warnings ?? []) as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + ttl * 60_000),
      },
    });
  }

  /** The one to present next: oldest first, so the queue drains in arrival order. */
  findPending(channel: string, externalUserId: string): Promise<BotDraft | null> {
    return this.prisma.botDraft.findFirst({
      where: { channel, externalUserId, status: 'pending', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
  }

  listPending(channel: string, externalUserId: string): Promise<BotDraft[]> {
    return this.prisma.botDraft.findMany({
      where: { channel, externalUserId, status: 'pending', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
  }

  countPending(channel: string, externalUserId: string): Promise<number> {
    return this.prisma.botDraft.count({
      where: { channel, externalUserId, status: 'pending', expiresAt: { gt: new Date() } },
    });
  }

  /**
   * Scoped to the company, always.
   *
   * Draft ids are UUIDs and the WhatsApp channel currently pins a single
   * company, so an unscoped lookup was not exploitable — but "not exploitable
   * yet" is the assumption that breaks the moment a second farm is onboarded.
   * The company comes from the caller's identity; a draft belonging to anyone
   * else simply does not exist.
   */
  findById(companyId: string, draftId: string): Promise<BotDraft | null> {
    return this.prisma.botDraft.findFirst({ where: { id: draftId, companyId } });
  }

  /**
   * Atomically moves a draft from pending to confirmed and returns it.
   *
   * Returns null when it was already confirmed, cancelled or expired — which is
   * exactly what makes a double tap on the confirm button harmless. Without
   * this, a second tap would register the payment twice.
   */
  async claim(companyId: string, draftId: string): Promise<BotDraft | null> {
    const { count } = await this.prisma.botDraft.updateMany({
      where: { id: draftId, companyId, status: 'pending', expiresAt: { gt: new Date() } },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });

    if (count === 0) {
      this.logger.debug(`Draft ${draftId} was already resolved — ignoring`);
      return null;
    }

    return this.prisma.botDraft.findFirst({ where: { id: draftId, companyId } });
  }

  async cancel(companyId: string, draftId: string): Promise<boolean> {
    const { count } = await this.prisma.botDraft.updateMany({
      where: { id: draftId, companyId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    return count > 0;
  }

  async markExecuted(draftId: string, resultType: string, resultId: string) {
    await this.prisma.botDraft.update({
      where: { id: draftId },
      data: { resultType, resultId },
    });
  }

  /** Records the failure and returns the draft to pending so it can be retried. */
  async markFailed(draftId: string, message: string) {
    await this.prisma.botDraft.update({
      where: { id: draftId },
      data: { status: 'pending', confirmedAt: null, errorMessage: message.slice(0, 500) },
    });
  }

  async expireStale(): Promise<number> {
    const { count } = await this.prisma.botDraft.updateMany({
      where: { status: 'pending', expiresAt: { lte: new Date() } },
      data: { status: 'expired' },
    });
    return count;
  }
}
