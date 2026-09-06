import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramApiService } from './telegram-api.service';
import { TelegramCallbackService } from './telegram-callback-data';
import { toInlineKeyboard, toTelegramHtml } from './telegram-renderer';
import { ChannelRegistryService } from '../assistant/inbound/channel-registry.service';
import type { ChannelSender, InboundEnvelope } from '../assistant/inbound/channel.port';
import type { TelegramMessage, TelegramUpdate } from './telegram.schema';
import type { IncomingMessage, OutgoingMessage } from '../assistant/types/assistant.types';

export const TELEGRAM_CHANNEL = 'telegram';

/**
 * Translates between Telegram's wire format and the channel-agnostic core.
 *
 * All the Telegram-specific knowledge lives here — update shapes, file
 * download, HTML instead of WhatsApp markup, the 64-byte callback ceiling — so
 * the assistant never learns what channel it is talking to.
 */
@Injectable()
export class TelegramTransportService implements ChannelSender, OnModuleInit {
  private readonly logger = new Logger(TelegramTransportService.name);
  readonly channel = TELEGRAM_CHANNEL;

  constructor(
    private readonly api: TelegramApiService,
    private readonly callbacks: TelegramCallbackService,
    private readonly registry: ChannelRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  /**
   * Takes delivery of an update and wraps it for the core.
   *
   * Clearing the tapped button's spinner happens here rather than on the
   * acknowledge path, because it is right even for an update we end up
   * discarding as a duplicate: the tap did arrive, and a button left spinning
   * reads as a bot that hung.
   */
  receive(update: TelegramUpdate): InboundEnvelope | null {
    const chatId = chatIdOf(update);
    if (!chatId) return null;

    if (update.callback_query) {
      void this.api.answerCallbackQuery(update.callback_query.id);
    }

    return {
      channel: TELEGRAM_CHANNEL,
      // `update_id` and not `message_id`: the latter is only unique within a
      // chat, so two senders would collide on the idempotency ledger.
      externalId: String(update.update_id),
      externalUserId: chatId,
      messageType: describeType(update),
      isReceipt: isReceiptImage(update.message),
      // The webhook answers 200 before the work is done, so Telegram considers
      // it delivered and will not hand it back.
      redelivers: false,
      open: () => this.toIncoming(update),
    };
  }

  /**
   * Builds an IncomingMessage, downloading media when there is any.
   *
   * Returns null for anything we do not act on (voice notes, video, location,
   * stickers, edits, chat joins). Those are dropped silently rather than
   * answered: replying tells the user nothing they can use.
   */
  async toIncoming(update: TelegramUpdate): Promise<IncomingMessage | null> {
    const chatId = chatIdOf(update);
    if (!chatId) return null;

    const base = {
      channel: TELEGRAM_CHANNEL,
      externalId: String(update.update_id),
      from: chatId,
    };

    if (update.callback_query) {
      const data = update.callback_query.data;
      if (!data) return null;
      return { ...base, kind: 'button', buttonId: this.callbacks.decode(data) };
    }

    const message = update.message;
    if (!message) return null;

    if (message.web_app_data) {
      const flowReply = this.parseWebAppData(message.web_app_data.data, update.update_id);
      return flowReply ? { ...base, kind: 'flow_reply', flowReply } : null;
    }

    if (message.photo?.length) {
      // Last is the largest Telegram kept. The reader wants every pixel it can
      // get: a compressed thumbnail is where OCR starts inventing digits.
      const largest = message.photo[message.photo.length - 1];
      const media = await this.api.downloadFile(largest.file_id);
      return { ...base, kind: 'image', media };
    }

    if (message.document) {
      // Screenshots arrive as documents when sent without compression, which is
      // how a user avoids the re-encode — worth reading. A PDF is not.
      if (!message.document.mime_type?.startsWith('image/')) return null;
      const media = await this.api.downloadFile(message.document.file_id);
      return { ...base, kind: 'image', media };
    }

    if (message.text) {
      return { ...base, kind: 'text', text: message.text };
    }

    this.logger.debug(`Ignoring unsupported update ${update.update_id}`);
    return null;
  }

  async send(to: string, message: OutgoingMessage): Promise<void> {
    const keyboard = message.buttons?.length
      ? toInlineKeyboard(message.buttons, (id) => this.callbacks.encode(id))
      : undefined;

    await this.api.sendMessage(to, toTelegramHtml(message.text), keyboard);
  }

  /**
   * Raises "typing…" while a receipt is being read.
   *
   * Only the typing half of this port applies: Telegram has no read receipt a
   * bot can send, and the tap spinner is already cleared in `receive`.
   */
  async acknowledge(envelope: InboundEnvelope, options: { typing: boolean }): Promise<void> {
    if (!options.typing) return;
    await this.api.sendChatAction(envelope.externalUserId, 'typing');
  }

  /**
   * Pulls the answers out of a Mini App submission.
   *
   * The page passes a JSON string carrying whatever the form collected plus the
   * `flow_token` we issued. Without a token there is nothing to correlate it
   * to, so it is dropped rather than guessed at — exactly how a submitted
   * WhatsApp form is treated.
   */
  private parseWebAppData(
    raw: string,
    updateId: number,
  ): { flowToken: string; submission: Record<string, unknown> } | null {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`web_app_data carried invalid JSON on update ${updateId}`);
      return null;
    }

    const flowToken = typeof parsed.flow_token === 'string' ? parsed.flow_token : null;
    if (!flowToken) {
      this.logger.warn(`web_app_data without a flow_token on update ${updateId}`);
      return null;
    }

    const { flow_token: _token, ...submission } = parsed;
    return { flowToken, submission };
  }
}

/**
 * Where to answer.
 *
 * `callback_query.message` is absent when the message the button hangs off is
 * too old for Telegram to send back. Falling back to the sender is right for
 * this bot: every conversation it has is a private chat, where the chat id and
 * the user id are the same number.
 */
function chatIdOf(update: TelegramUpdate): string | null {
  const id =
    update.message?.chat.id ??
    update.callback_query?.message?.chat.id ??
    update.callback_query?.from.id;
  return id === undefined ? null : String(id);
}

/** What the ledger records. Coarse on purpose: it is for reading, not routing. */
function describeType(update: TelegramUpdate): string {
  if (update.callback_query) return 'callback_query';
  const message = update.message;
  if (!message) return 'unknown';
  if (message.web_app_data) return 'web_app_data';
  if (message.photo?.length) return 'photo';
  if (message.document) return `document:${message.document.mime_type ?? 'unknown'}`;
  if (message.text) return 'text';
  return 'unsupported';
}

/**
 * Whether this update will end up in the receipt reader.
 *
 * Mirrors the photo/document branches of `toIncoming`: a screenshot sent as an
 * uncompressed file is worth reading, a PDF or a spreadsheet is not.
 */
function isReceiptImage(message: TelegramMessage | undefined): boolean {
  if (!message) return false;
  if (message.photo?.length) return true;
  return Boolean(message.document?.mime_type?.startsWith('image/'));
}
