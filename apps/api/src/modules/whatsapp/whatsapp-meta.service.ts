import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { OutgoingFlow, OutgoingMessage, ReplyButton } from '../assistant/types/assistant.types';

const DEFAULT_GRAPH_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 20_000;
/**
 * Ceiling on a downloaded attachment.
 *
 * WhatsApp itself caps images around 5 MB, so this is generous for anything
 * real. Without it the buffer is whatever the far end decides to send, and it
 * goes straight into sharp, which expands it in memory — a compressed image
 * that unpacks to gigabytes is a one-request way to kill the process.
 */
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
/** WhatsApp caps reply buttons at three; anything more has to become a list. */
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;
const MAX_LIST_ROWS = 10;
const MAX_ROW_TITLE = 24;
const MAX_ROW_DESCRIPTION = 72;

/** Meta's media CDN rejects requests without a browser-ish user agent. */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

@Injectable()
export class WhatsappMetaService {
  private readonly logger = new Logger(WhatsappMetaService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get('META_WHATSAPP_PHONE_ID') && this.token);
  }

  /**
   * Sends a reply, choosing the right WhatsApp primitive for the button count.
   *
   * The core emits as many choices as the decision needs and does not know
   * about WhatsApp's three-button ceiling — collapsing to a list is a transport
   * concern, so a channel without that limit can just render them all.
   */
  async sendReply(to: string, message: OutgoingMessage): Promise<void> {
    if (message.flow) {
      await this.sendFlow(to, message.text, message.flow);
      return;
    }

    if (!message.buttons || message.buttons.length === 0) {
      await this.sendText(to, message.text);
      return;
    }

    if (message.buttons.length <= MAX_BUTTONS) {
      await this.sendInteractiveButtons(to, message.text, message.buttons);
      return;
    }

    await this.sendInteractiveList(to, message.text, message.buttons);
  }

  /**
   * Marks an inbound message read, optionally raising the typing bubble.
   *
   * The read receipt is safe to send for anything: it says "this arrived",
   * which is always true by the time we are here.
   *
   * `typing` is not. WhatsApp keeps that bubble up until a message actually
   * arrives, so raising it for work that may answer with nothing — a stale
   * button, a tap the assistant deliberately ignores — leaves the bot visibly
   * typing a reply that never comes, which reads as frozen. Only pass it on the
   * path that is genuinely slow *and* always answers.
   *
   * Failure is swallowed on purpose: a missing receipt must never cost the user
   * their message.
   */
  async markRead(messageId: string, options?: { typing?: boolean }): Promise<void> {
    try {
      await this.post({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        ...(options?.typing ? { typing_indicator: { type: 'text' } } : {}),
      });
    } catch (error) {
      this.logger.warn(`Could not mark ${messageId} as read: ${describe(error)}`);
    }
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    });
  }

  async sendInteractiveButtons(to: string, body: string, buttons: ReplyButton[]): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.slice(0, MAX_BUTTONS).map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: truncate(button.title, MAX_BUTTON_TITLE) },
          })),
        },
      },
    });
  }

  async sendInteractiveList(to: string, body: string, buttons: ReplyButton[]): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: 'Elegir',
          sections: [
            {
              title: 'Opciones',
              rows: buttons.slice(0, MAX_LIST_ROWS).map((button) => ({
                id: button.id,
                title: truncate(button.title, MAX_ROW_TITLE),
                // Meta rejects the row outright if the key is present but
                // empty, so it is omitted rather than sent blank.
                ...(button.description
                  ? { description: truncate(button.description, MAX_ROW_DESCRIPTION) }
                  : {}),
              })),
            },
          ],
        },
      },
    });
  }

  /**
   * Opens a native form in the chat.
   *
   * `navigate` mode with the screen's data inline: the form needs no endpoint
   * of ours, so there is nothing to host and nothing to keep online. The cost
   * is that the data ages while the form is open — anything time-sensitive
   * (an exchange rate) is recomputed when the answer comes back.
   */
  async sendFlow(to: string, body: string, flow: OutgoingFlow): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'flow',
        ...(flow.header ? { header: { type: 'text', text: truncate(flow.header, 60) } } : {}),
        body: { text: body },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flow.flowToken,
            flow_id: flow.flowId,
            flow_cta: truncate(flow.cta, 20),
            flow_action: 'navigate',
            ...(flow.draft ? { mode: 'draft' } : {}),
            flow_action_payload: { screen: flow.screen, data: flow.data },
          },
        },
      },
    });
  }

  /**
   * Downloads a media attachment.
   *
   * Two hops by design: the id resolves to a short-lived signed URL, and that
   * URL still requires the bearer token — fetching it unauthenticated returns
   * 401, which is the usual reason this appears to "work" in a browser and
   * fail from code.
   */
  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const metadata = await this.getMediaMetadata(mediaId);

    try {
      const response = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(metadata.url, {
          responseType: 'arraybuffer',
          timeout: REQUEST_TIMEOUT_MS,
          maxContentLength: MAX_MEDIA_BYTES,
          maxBodyLength: MAX_MEDIA_BYTES,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': BROWSER_USER_AGENT,
          },
        }),
      );
      return { data: Buffer.from(response.data), mimeType: metadata.mimeType };
    } catch (error) {
      this.logger.error(`Failed to download media ${mediaId}`, describe(error));
      throw new ServiceUnavailableException('No pude descargar la imagen de WhatsApp');
    }
  }

  private async getMediaMetadata(mediaId: string): Promise<{ url: string; mimeType: string }> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{ url: string; mime_type: string }>(
          `https://graph.facebook.com/${this.graphVersion}/${mediaId}`,
          {
            timeout: REQUEST_TIMEOUT_MS,
            headers: { Authorization: `Bearer ${this.token}` },
          },
        ),
      );
      return { url: data.url, mimeType: data.mime_type };
    } catch (error) {
      this.logger.error(`Failed to resolve media ${mediaId}`, describe(error));
      throw new ServiceUnavailableException('No pude obtener la imagen de WhatsApp');
    }
  }

  /**
   * Posts to the Graph API and throws on failure.
   *
   * The previous implementation logged and swallowed errors, so a rejected send
   * left the caller believing the user had seen a message they never got. A
   * failed send has to surface.
   */
  private async post(body: Record<string, unknown>): Promise<void> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp no está configurado (falta META_WHATSAPP_PHONE_ID o META_WHATSAPP_TOKEN)',
      );
    }

    try {
      await firstValueFrom(
        this.httpService.post(this.messagesUrl, body, {
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }),
      );
    } catch (error) {
      this.logger.error(
        `Graph API rejected the message to ${body.to ?? body.message_id}`,
        describe(error),
      );
      throw new ServiceUnavailableException('WhatsApp rechazó el mensaje');
    }
  }

  // Resolved per call rather than cached in the constructor, so rotating the
  // token in .env does not require restarting the process.
  private get token(): string {
    return this.configService.get<string>('META_WHATSAPP_TOKEN') ?? '';
  }

  private get graphVersion(): string {
    return this.configService.get<string>('META_GRAPH_VERSION') ?? DEFAULT_GRAPH_VERSION;
  }

  private get messagesUrl(): string {
    const phoneId = this.configService.get<string>('META_WHATSAPP_PHONE_ID');
    return `https://graph.facebook.com/${this.graphVersion}/${phoneId}/messages`;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function describe(error: unknown): string {
  const response = (error as { response?: { data?: unknown } })?.response?.data;
  if (response) return JSON.stringify(response).slice(0, 500);
  return (error as Error)?.message ?? String(error);
}
