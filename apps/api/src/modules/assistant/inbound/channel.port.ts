import type { IncomingMessage, OutgoingMessage } from '../types/assistant.types';

/**
 * One inbound event, before it has cost anything to look at.
 *
 * The identifying fields are plain data so the core can claim the message
 * against the idempotency ledger straight away, but the conversion is deferred:
 * turning a WhatsApp image into an `IncomingMessage` downloads several
 * megabytes, and a redelivered message must never pay that price. The transport
 * knows how to open it; the core decides whether it is worth opening.
 */
export interface InboundEnvelope {
  channel: string;
  /** The channel's own message id — the idempotency key. */
  externalId: string;
  /** Sender identity on that channel. Already in the channel's canonical form. */
  externalUserId: string;
  /** The channel's own type name, kept verbatim for the ledger. */
  messageType: string;
  /**
   * Whether this will end up in the receipt reader. Decided by the transport,
   * which is the only side that can tell a screenshot sent as a file from a PDF.
   */
  isReceipt: boolean;
  /**
   * Whether the channel hands this message back if we do not finish it.
   *
   * True for the pulled queue, which only drops an event once it is acked, so a
   * failure can release its claim and be retried. False for a webhook we have
   * already answered 200 — there is no second delivery to wait for, and
   * releasing the claim would erase the only record that it arrived.
   */
  redelivers: boolean;
  /** Returns null for anything the channel carries but we do not act on. */
  open(): Promise<IncomingMessage | null>;
}

/**
 * What a transport must provide for the core to answer through it.
 *
 * Replies do not always come back on the request that caused them — a batch of
 * receipts is summarised once, after the last one has been read — so the core
 * needs to reach the channel on its own rather than returning a value upwards.
 */
export interface ChannelSender {
  readonly channel: string;

  send(to: string, message: OutgoingMessage): Promise<void>;

  /**
   * Optional "it arrived, and I am on it" signal: a read receipt, a typing
   * bubble. A channel without one simply does not implement this, and failure
   * is never fatal — the real answer is still coming.
   *
   * Takes the whole envelope because channels signal against different things:
   * WhatsApp marks a specific message read, Telegram raises typing in a chat.
   * `typing` stays a parameter so the policy behind it — only work that is
   * genuinely slow and always answers — is decided once, in the core.
   */
  acknowledge?(envelope: InboundEnvelope, options: { typing: boolean }): Promise<void>;
}
