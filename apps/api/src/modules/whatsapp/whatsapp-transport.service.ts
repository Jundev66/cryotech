import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WhatsappMetaService } from './whatsapp-meta.service';
import { ChannelRegistryService } from '../assistant/inbound/channel-registry.service';
import type {
  ChannelSender,
  InboundEnvelope,
} from '../assistant/inbound/channel.port';
import type { IncomingMessage, OutgoingMessage } from '../assistant/types/assistant.types';

export const WHATSAPP_CHANNEL = 'whatsapp';

/** The shape Meta puts on the wire, narrowed to what we act on. */
export interface MetaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string };
  document?: { id: string; mime_type?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
    /** A submitted Flow. `response_json` is a JSON *string*, not an object. */
    nfm_reply?: { name?: string; body?: string; response_json?: string };
  };
  button?: { payload?: string; text?: string };
}

/**
 * Translates between Meta's wire format and the channel-agnostic core.
 *
 * All the WhatsApp-specific knowledge lives here — message shapes, media
 * download, button-vs-list rendering — so the assistant never learns what
 * channel it is talking to.
 */
@Injectable()
export class WhatsappTransportService implements ChannelSender, OnModuleInit {
  private readonly logger = new Logger(WhatsappTransportService.name);
  readonly channel = WHATSAPP_CHANNEL;

  constructor(
    private readonly meta: WhatsappMetaService,
    private readonly registry: ChannelRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  /**
   * Wraps a Meta message as something the core can act on.
   *
   * `open` stays unevaluated: it downloads the attachment, and the core has to
   * be able to claim the message against the idempotency ledger before paying
   * that cost for a redelivery.
   */
  toEnvelope(message: MetaMessage): InboundEnvelope {
    return {
      channel: WHATSAPP_CHANNEL,
      externalId: message.id,
      externalUserId: normalizePhone(message.from),
      messageType: message.type,
      isReceipt: isReceiptImage(message),
      // The poller acks the whole batch it pulled, failures included, so a
      // released claim would never actually be served again. Keeping the ledger
      // row is the only trace left. (See the note in whatsapp-poller.service.ts
      // about acking selectively, which is what would make this true.)
      redelivers: false,
      open: () => this.toIncoming(message),
    };
  }

  /**
   * Builds an IncomingMessage, downloading media when there is any.
   *
   * Returns null for anything we do not act on (audio, video, location,
   * stickers, reactions). Those are dropped silently rather than answered:
   * replying costs an outbound message and tells the user nothing they can use.
   */
  async toIncoming(message: MetaMessage): Promise<IncomingMessage | null> {
    const base = {
      channel: WHATSAPP_CHANNEL,
      externalId: message.id,
      from: normalizePhone(message.from),
    };

    switch (message.type) {
      case 'text':
        if (!message.text?.body) return null;
        return { ...base, kind: 'text', text: message.text.body };

      case 'image': {
        if (!message.image?.id) return null;
        const media = await this.meta.downloadMedia(message.image.id);
        return { ...base, kind: 'image', media };
      }

      case 'document': {
        // Screenshots occasionally arrive as documents when sent "as file",
        // which is how a user avoids WhatsApp's re-compression — worth reading.
        if (!message.document?.id) return null;
        if (!message.document.mime_type?.startsWith('image/')) return null;
        const media = await this.meta.downloadMedia(message.document.id);
        return { ...base, kind: 'image', media };
      }

      case 'interactive': {
        const flowReply = this.parseFlowReply(message);
        if (flowReply) return { ...base, kind: 'flow_reply', flowReply };

        const buttonId =
          message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
        if (!buttonId) return null;
        return { ...base, kind: 'button', buttonId };
      }

      case 'button':
        if (!message.button?.payload) return null;
        return { ...base, kind: 'button', buttonId: message.button.payload };

      default:
        this.logger.debug(`Ignoring unsupported message type: ${message.type}`);
        return null;
    }
  }

  async send(to: string, message: OutgoingMessage): Promise<void> {
    await this.meta.sendReply(to, message);
  }

  /**
   * Signals "received" before the work starts, and "working on it" when the
   * work is going to take a while.
   *
   * A transport concern, not a core one: the assistant decides what to say, not
   * whether the chat shows a typing bubble, and a channel without one just
   * doesn't implement this.
   *
   * Only a receipt image earns the typing bubble — that is `isReceipt` on the
   * envelope. Everything else is answered in about a second, so the bubble buys
   * nothing, and a tap that the assistant answers with silence would be left
   * visibly typing forever.
   */
  async acknowledge(envelope: InboundEnvelope, options: { typing: boolean }): Promise<void> {
    await this.meta.markRead(envelope.externalId, { typing: options.typing });
  }

  /**
   * Pulls the answers out of a submitted form.
   *
   * `response_json` is a JSON string carrying whatever the flow's `complete`
   * payload declared, plus the `flow_token` we issued. Without a token there is
   * nothing to correlate it to, so it is dropped rather than guessed at.
   */
  private parseFlowReply(
    message: MetaMessage,
  ): { flowToken: string; submission: Record<string, unknown> } | null {
    const raw = message.interactive?.nfm_reply?.response_json;
    if (!raw) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`nfm_reply carried invalid JSON on message ${message.id}`);
      return null;
    }

    const flowToken = typeof parsed.flow_token === 'string' ? parsed.flow_token : null;
    if (!flowToken) {
      this.logger.warn(`nfm_reply without a flow_token on message ${message.id}`);
      return null;
    }

    const { flow_token: _token, ...submission } = parsed;
    return { flowToken, submission };
  }
}

/**
 * Whether this message will end up in the receipt reader.
 *
 * Mirrors the image/document branches of `toIncoming`: a screenshot sent "as
 * file" arrives as a document and is worth reading, but a PDF or a spreadsheet
 * is not.
 */
export function isReceiptImage(message: MetaMessage): boolean {
  if (message.type === 'image') return Boolean(message.image?.id);
  if (message.type === 'document') {
    return Boolean(message.document?.id && message.document.mime_type?.startsWith('image/'));
  }
  return false;
}

/** Meta sends E.164 without '+'; keep that as the canonical form. */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}
