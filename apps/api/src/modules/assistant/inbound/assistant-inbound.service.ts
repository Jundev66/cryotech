import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChannelRegistryService } from './channel-registry.service';
import { IdentityService, type Identity } from './identity.service';
import { InboundMessageService } from './inbound-message.service';
import { ReceiptIntakeService } from '../receipt-intake.service';
import { AssistantService } from '../assistant.service';
import { ReceiptQueueService, type IntakeOutcome } from '../queue/receipt-queue.service';
import type { InboundEnvelope } from './channel.port';
import type { IncomingMessage, OutgoingMessage } from '../types/assistant.types';

/**
 * How long a sender's receipts keep accumulating before they are summarised.
 *
 * Long enough that screenshots sent one after another land in the same batch,
 * short enough that a single receipt is not left waiting on a timer for its
 * answer. Anything the sender types or taps flushes immediately anyway.
 */
const RECEIPT_FLUSH_MS = 3_000;

interface ReceiptBatch {
  outcomes: IntakeOutcome[];
  timer: NodeJS.Timeout | null;
  /** Whether the "hold on, reading them" line has already gone out. */
  announced: boolean;
  /** Bumped every time a receipt lands, so a stale timer knows to stand down. */
  generation: number;
}

/**
 * Runs an inbound message through the assistant, whatever channel it came from.
 *
 * This used to live inside the WhatsApp poller, which meant a second channel
 * would have had to reimplement idempotency, the allowlist, the dispatch by
 * message kind and the receipt batching — four chances to diverge on things
 * that must not diverge. The transports now only translate; the sequence lives
 * here, once.
 */
@Injectable()
export class AssistantInboundService implements OnModuleDestroy {
  private readonly logger = new Logger(AssistantInboundService.name);
  private readonly batches = new Map<string, ReceiptBatch>();
  private readonly chains = new Map<string, Promise<void>>();

  constructor(
    private readonly registry: ChannelRegistryService,
    private readonly identity: IdentityService,
    private readonly inbound: InboundMessageService,
    private readonly intake: ReceiptIntakeService,
    private readonly assistant: AssistantService,
    private readonly queue: ReceiptQueueService,
  ) {}

  /**
   * Never rejects. A transport that pushes an event has nowhere useful to put
   * an exception — a webhook has already answered, and a poller would abort the
   * rest of its batch — so everything is caught and recorded on the ledger.
   */
  async handle(envelope: InboundEnvelope): Promise<void> {
    // Everything, including the claim, runs one at a time per sender. Webhook
    // deliveries arrive concurrently: without this, two copies of the same
    // update could both pass the claim, and a tap could overtake the receipt
    // that arrived before it.
    await this.serialize(keyOf(envelope.channel, envelope.externalUserId), async () => {
      const claimed = await this.inbound.claim({
        channel: envelope.channel,
        externalId: envelope.externalId,
        externalUserId: envelope.externalUserId,
        messageType: envelope.messageType,
      });
      if (!claimed) return;

      const identity = this.identity.resolve(envelope.channel, envelope.externalUserId);
      if (!identity) {
        // Silence is deliberate: no reply, no cost, no confirmation to a
        // stranger that this account is in use.
        await this.inbound.markIgnored(envelope.channel, envelope.externalId, 'sender not allowed');
        return;
      }

      await this.process(envelope, identity);
    });
  }

  private async process(envelope: InboundEnvelope, identity: Identity): Promise<void> {
    const { channel, externalId } = envelope;

    try {
      // Before the slow part, and not awaited: downloading the media and
      // running OCR takes seconds, and until then the sender is looking at an
      // undelivered tick with no way to tell the bot from a dead one.
      void this.acknowledge(envelope);

      const incoming = await envelope.open();
      if (!incoming) {
        await this.inbound.markIgnored(
          channel,
          externalId,
          `unsupported type ${envelope.messageType}`,
        );
        return;
      }

      if (incoming.kind === 'image' && incoming.media) {
        await this.intakeReceipt(channel, identity, incoming.media.data);
        await this.inbound.markProcessed(channel, externalId);
        return;
      }

      // A tap or a command must not jump ahead of receipts that arrived before
      // it, so anything still batching for this sender is answered first.
      await this.flush(channel, identity.externalUserId);

      const reply = await this.route(incoming, channel, identity);
      if (reply) await this.registry.get(channel).send(identity.externalUserId, reply);

      await this.inbound.markProcessed(channel, externalId);
    } catch (error) {
      const reason = (error as Error)?.message ?? String(error);
      if (envelope.redelivers) {
        await this.inbound.releaseForRetry(channel, externalId, reason);
      } else {
        await this.inbound.markErrored(channel, externalId, reason);
      }
    }
  }

  /**
   * Reads one receipt and holds its outcome for the batch summary.
   *
   * Receipts arriving together are answered together. Five screenshots must not
   * produce five summaries: they interleave unreadably, and once Meta charges
   * for service messages they cost five times as much.
   */
  private async intakeReceipt(channel: string, identity: Identity, image: Buffer): Promise<void> {
    const key = keyOf(channel, identity.externalUserId);
    const batch = this.batches.get(key) ?? {
      outcomes: [],
      timer: null,
      announced: false,
      generation: 0,
    };
    this.batches.set(key, batch);

    // On the second receipt, say something now. The summary is still one
    // message for the whole batch, but five screenshots take the best part of a
    // minute and all of it would otherwise be silent. How many are coming is
    // unknowable — they arrive one at a time — so the count waits for the
    // summary, which has it. A lone receipt is quick enough that the typing
    // indicator already covers it.
    if (batch.outcomes.length === 1 && !batch.announced) {
      batch.announced = true;
      await this.sendQuietly(channel, identity.externalUserId, {
        text: 'Recibí varios comprobantes. Los estoy leyendo, te respondo en un momento.',
      });
    }

    const result = await this.intake.intake({
      companyId: identity.companyId,
      channel,
      externalUserId: identity.externalUserId,
      image,
    });

    batch.outcomes.push(result.outcome);
    this.arm(channel, identity.externalUserId, batch);
  }

  /** Restarts the quiet period; the batch closes once nothing new has landed. */
  private arm(channel: string, externalUserId: string, batch: ReceiptBatch): void {
    if (batch.timer) clearTimeout(batch.timer);
    batch.generation += 1;
    const generation = batch.generation;

    batch.timer = setTimeout(() => {
      // Queued behind whatever this sender has in flight, then checked again:
      // by the time it runs another receipt may have re-armed the batch, and
      // this timer no longer speaks for it.
      void this.serialize(keyOf(channel, externalUserId), async () => {
        const current = this.batches.get(keyOf(channel, externalUserId));
        if (!current || current.generation !== generation) return;
        await this.flush(channel, externalUserId);
      });
    }, RECEIPT_FLUSH_MS);

    // A pending flush must not hold the process open at shutdown.
    batch.timer.unref?.();
  }

  /** Closes the batch and sends its single summary. */
  private async flush(channel: string, externalUserId: string): Promise<void> {
    const key = keyOf(channel, externalUserId);
    const batch = this.batches.get(key);
    if (!batch) return;

    if (batch.timer) clearTimeout(batch.timer);
    this.batches.delete(key);
    if (batch.outcomes.length === 0) return;

    const reply = await this.queue.summarizeBatch(channel, externalUserId, batch.outcomes);
    if (reply) await this.registry.get(channel).send(externalUserId, reply);
  }

  private async route(
    incoming: IncomingMessage,
    channel: string,
    identity: Identity,
  ): Promise<OutgoingMessage | null> {
    const { companyId, externalUserId } = identity;

    if (incoming.kind === 'flow_reply' && incoming.flowReply) {
      return this.assistant.handleFlowReply(
        incoming.flowReply.flowToken,
        incoming.flowReply.submission,
      );
    }

    if (incoming.kind === 'button' && incoming.buttonId) {
      return this.assistant.handleButton(incoming.buttonId, companyId, channel, externalUserId);
    }

    if (incoming.kind === 'text') {
      // Anything typed opens the menu; the assistant decides whether a word is
      // a shortcut. No message goes unanswered and none needs to be understood.
      return this.assistant.handleText(incoming.text ?? '', companyId, channel, externalUserId);
    }

    return null;
  }

  /**
   * Nothing here may throw. It is called without being awaited — the point is
   * not to make the user wait for a read receipt — so a rejection would have
   * nowhere to land and would take the process down as an unhandled rejection.
   * That includes the registry lookup, not just the send.
   */
  private async acknowledge(envelope: InboundEnvelope): Promise<void> {
    try {
      const sender = this.registry.get(envelope.channel);
      if (!sender.acknowledge) return;
      await sender.acknowledge(envelope, { typing: envelope.isReceipt });
    } catch (error) {
      // Never fatal: the real answer is still coming.
      this.logger.warn(
        `Could not acknowledge ${envelope.channel}/${envelope.externalId}`,
        (error as Error)?.message,
      );
    }
  }

  /** For messages that are courtesy, not content — a failed one changes nothing. */
  private async sendQuietly(
    channel: string,
    externalUserId: string,
    message: OutgoingMessage,
  ): Promise<void> {
    try {
      await this.registry.get(channel).send(externalUserId, message);
    } catch (error) {
      this.logger.warn(`Could not send notice on ${channel}`, (error as Error)?.message);
    }
  }

  /**
   * One task at a time per sender, in arrival order.
   *
   * Rejections are absorbed here so a failed task cannot poison the next one
   * queued behind it — each caller has already recorded its own failure on the
   * ledger by this point.
   */
  private serialize(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.chains.get(key) ?? Promise.resolve();

    const next = previous
      .then(() => task())
      .catch((error) => {
        this.logger.error(`Inbound task failed for ${key}`, (error as Error)?.message);
      });

    this.chains.set(key, next);
    void next.then(() => {
      // Only the tail clears the entry; clearing unconditionally would drop a
      // task that queued behind this one while it was running.
      if (this.chains.get(key) === next) this.chains.delete(key);
    });

    return next;
  }

  /**
   * Drains what is still batching, so a restart mid-batch does not leave
   * receipts read but never shown.
   */
  async onModuleDestroy(): Promise<void> {
    const open = [...this.batches.keys()].map(splitKey);
    await Promise.allSettled(open.map(([channel, user]) => this.flush(channel, user)));
  }
}

/** Channels are single words, so the first colon is always the separator. */
function keyOf(channel: string, externalUserId: string): string {
  return `${channel}:${externalUserId}`;
}

function splitKey(key: string): [string, string] {
  const separator = key.indexOf(':');
  return [key.slice(0, separator), key.slice(separator + 1)];
}
