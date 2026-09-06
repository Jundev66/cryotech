import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Prisma, type BotFlowSession } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { FlowKind } from './flow.catalog';

/** Long enough to fill a form in one sitting, short enough that stale ids die. */
const DEFAULT_TTL_MINUTES = 60;

@Injectable()
export class FlowSessionService {
  private readonly logger = new Logger(FlowSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Opens a session and returns the token to send with the form.
   *
   * The token is the only thing that comes back with the answer — WhatsApp says
   * nothing about who submitted it or what it was for — so the context is
   * parked here and looked up on the way in.
   */
  async open(params: {
    companyId: string;
    channel: string;
    externalUserId: string;
    flowKind: FlowKind;
    context?: Prisma.InputJsonValue;
    /** Answers already known, so their questions are never asked. */
    answers?: Prisma.InputJsonValue;
    /** Which question to open on, when the seeded answers cover the first ones. */
    step?: number;
  }): Promise<BotFlowSession> {
    const ttl = Number(this.configService.get('ASSISTANT_FLOW_TTL_MINUTES') ?? DEFAULT_TTL_MINUTES);

    return this.prisma.botFlowSession.create({
      data: {
        companyId: params.companyId,
        channel: params.channel,
        externalUserId: params.externalUserId,
        flowKind: params.flowKind,
        flowToken: randomUUID(),
        context: params.context ?? Prisma.JsonNull,
        answers: params.answers ?? Prisma.JsonNull,
        step: params.step ?? 0,
        expiresAt: new Date(Date.now() + ttl * 60_000),
      },
    });
  }

  /**
   * Claims a submission, atomically.
   *
   * The poller can hand the same webhook over twice — Meta redelivers, and a
   * crash between processing and acking replays the batch — so the update is
   * conditional on the session still being pending. A second attempt claims
   * nothing and therefore registers nothing.
   */
  async claim(flowToken: string): Promise<BotFlowSession | null> {
    const claimed = await this.prisma.botFlowSession.updateMany({
      where: { flowToken, status: 'pending', expiresAt: { gt: new Date() } },
      data: { status: 'submitted', consumedAt: new Date() },
    });
    if (claimed.count === 0) return null;

    return this.prisma.botFlowSession.findUnique({ where: { flowToken } });
  }

  async markExecuted(id: string, resultType: string, resultId: string | null) {
    await this.prisma.botFlowSession.update({
      where: { id },
      data: { status: 'executed', resultType, resultId },
    });
  }

  /** Back to pending so the user can resubmit rather than lose what they typed. */
  async markFailed(id: string, message: string) {
    await this.prisma.botFlowSession.update({
      where: { id },
      data: { status: 'pending', errorMessage: message.slice(0, 500) },
    });
  }

  /** Why a token might be unclaimable, for a message that says something useful. */
  async describeUnclaimable(flowToken: string): Promise<string | null> {
    const session = await this.prisma.botFlowSession.findUnique({ where: { flowToken } });
    if (!session) {
      this.logger.warn(`Flow reply with an unknown token: ${flowToken}`);
      return null;
    }
    if (session.status === 'executed' || session.status === 'submitted') return null;
    if (session.expiresAt <= new Date()) {
      return 'Ese formulario venció. Ábrelo otra vez desde el menú.';
    }
    return null;
  }
}
