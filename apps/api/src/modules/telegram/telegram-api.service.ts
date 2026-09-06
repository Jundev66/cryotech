import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { InlineKeyboardButton } from './telegram-renderer';

const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Ceiling on a downloaded attachment.
 *
 * The Bot API will not serve a file over 20 MB at all, so this only has to be
 * sane. Without it the buffer is whatever the far end decides to send, and it
 * goes straight into sharp, which expands it in memory — a compressed image
 * that unpacks to gigabytes is a one-request way to kill the process.
 */
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async sendMessage(
    chatId: string,
    text: string,
    keyboard?: InlineKeyboardButton[][],
  ): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      // The assistant's own text is the message; a link preview would push it
      // off the screen and it never links anywhere worth previewing.
      link_preview_options: { is_disabled: true },
      ...(keyboard && keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  /**
   * Clears the spinner on a tapped inline button.
   *
   * Not optional: Telegram leaves the button visibly loading for a good while
   * if nothing answers the callback query, which reads as a bot that hung.
   * Failure is swallowed — the real reply is still on its way.
   */
  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    try {
      await this.call('answerCallbackQuery', { callback_query_id: callbackQueryId });
    } catch (error) {
      this.logger.warn(`Could not answer callback ${callbackQueryId}: ${describe(error)}`);
    }
  }

  /**
   * Raises the "typing…" line for a few seconds.
   *
   * Only worth doing for work that is genuinely slow *and* always answers:
   * Telegram clears this on its own after about five seconds, so unlike
   * WhatsApp it cannot be left stuck, but it still promises a reply.
   */
  async sendChatAction(chatId: string, action: 'typing' | 'upload_photo'): Promise<void> {
    try {
      await this.call('sendChatAction', { chat_id: chatId, action });
    } catch (error) {
      this.logger.warn(`Could not send chat action to ${chatId}: ${describe(error)}`);
    }
  }

  /**
   * Downloads an attachment.
   *
   * Two hops, like Meta's: the id resolves to a path valid for about an hour,
   * and the path is fetched from a different host. Unlike Meta's, the download
   * itself carries no auth — the token is in the URL — so it must never be
   * logged.
   */
  async downloadFile(fileId: string): Promise<{ data: Buffer; mimeType: string }> {
    const path = await this.getFilePath(fileId);

    try {
      const response = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(`${API_BASE}/file/bot${this.token}/${path}`, {
          responseType: 'arraybuffer',
          timeout: REQUEST_TIMEOUT_MS,
          maxContentLength: MAX_MEDIA_BYTES,
          maxBodyLength: MAX_MEDIA_BYTES,
        }),
      );
      return { data: Buffer.from(response.data), mimeType: mimeFromPath(path) };
    } catch (error) {
      // The path holds the bot token, so only the id goes in the log.
      this.logger.error(`Failed to download file ${fileId}`, describe(error));
      throw new ServiceUnavailableException('No pude descargar la imagen de Telegram');
    }
  }

  private async getFilePath(fileId: string): Promise<string> {
    const result = await this.call<{ file_path?: string }>('getFile', { file_id: fileId });
    if (!result?.file_path) {
      throw new ServiceUnavailableException('No pude obtener la imagen de Telegram');
    }
    return result.file_path;
  }

  /**
   * Calls a Bot API method and throws on failure.
   *
   * A rejected send that only logged would leave the caller believing the user
   * had seen a message they never got, so it has to surface.
   */
  private async call<T = unknown>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T | undefined> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Telegram no está configurado (falta TELEGRAM_BOT_TOKEN)');
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<TelegramResponse<T>>(`${API_BASE}/bot${this.token}/${method}`, body, {
          timeout: REQUEST_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      // Telegram answers 200 with ok:false for some rejections, so the status
      // code alone is not enough to call this a success.
      if (!data.ok) throw new Error(data.description ?? 'respuesta ok:false');
      return data.result;
    } catch (error) {
      this.logger.error(`Bot API rejected ${method}`, describe(error));
      throw new ServiceUnavailableException(`Telegram rechazó ${method}`);
    }
  }

  // Resolved per call rather than cached in the constructor, so rotating the
  // token in .env does not require restarting the process.
  private get token(): string {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN') ?? '';
  }
}

/**
 * A photo arrives as a `PhotoSize`, which carries no mime type — only the path
 * Telegram stored it under says what it is.
 */
function mimeFromPath(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
  };
  return types[extension] ?? 'image/jpeg';
}

function describe(error: unknown): string {
  const response = (error as { response?: { data?: unknown } })?.response?.data;
  if (response) return JSON.stringify(response).slice(0, 500);
  return (error as Error)?.message ?? String(error);
}
