import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class InboundMessageService {
  private readonly logger = new Logger(InboundMessageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims a message for processing, returning false if it was already seen.
   *
   * Every channel we speak is at-least-once. The Cloudflare buffer already
   * dedupes what Meta redelivers, but the pull is at-least-once by design: if
   * the process dies after registering a payment and before acking, the same
   * event comes back. Telegram redelivers on its own whenever a webhook call
   * does not come back 200 in time, which a cold start can easily cause. The
   * unique index on (channel, external_id) is what stops either from booking
   * the payment twice.
   */
  async claim(params: {
    channel: string;
    externalId: string;
    externalUserId: string;
    messageType: string;
  }): Promise<boolean> {
    try {
      await this.prisma.botInboundMessage.create({
        data: {
          channel: params.channel,
          externalId: params.externalId,
          externalUserId: params.externalUserId,
          messageType: params.messageType,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug(`Already processed ${params.channel}/${params.externalId} — skipping`);
        return false;
      }
      throw error;
    }
  }

  async markProcessed(channel: string, externalId: string) {
    await this.prisma.botInboundMessage.updateMany({
      where: { channel, externalId },
      data: { status: 'processed', processedAt: new Date() },
    });
  }

  async markIgnored(channel: string, externalId: string, reason: string) {
    await this.prisma.botInboundMessage.updateMany({
      where: { channel, externalId },
      data: { status: 'ignored', error: reason.slice(0, 500), processedAt: new Date() },
    });
  }

  /**
   * Records the failure and releases the claim, so a redelivery of the same
   * message is treated as new work rather than as a duplicate.
   *
   * Only for channels that will actually deliver it again: releasing a claim
   * nobody is going to redeem just erases the evidence. See `markErrored`.
   */
  async releaseForRetry(channel: string, externalId: string, reason: string) {
    await this.prisma.botInboundMessage.deleteMany({ where: { channel, externalId } });
    this.logger.error(`Released ${channel}/${externalId} for retry: ${reason}`);
  }

  /**
   * Records the failure and keeps the row.
   *
   * For channels that will not hand the message back — a webhook we already
   * answered 200 — this is the only trace that it ever arrived, and the user
   * believes they sent it. Losing that is how a receipt disappears silently.
   */
  async markErrored(channel: string, externalId: string, reason: string) {
    await this.prisma.botInboundMessage.updateMany({
      where: { channel, externalId },
      data: { status: 'failed', error: reason.slice(0, 500), processedAt: new Date() },
    });
    this.logger.error(`Failed ${channel}/${externalId}: ${reason}`);
  }
}
