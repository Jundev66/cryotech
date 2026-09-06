import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  RECEIPT_JSON_SCHEMA,
  isRawReceiptExtraction,
  type RawReceiptExtraction,
} from './receipt.schema';
import { RECEIPT_SYSTEM_PROMPT, TEXT_USER_PREFIX, IMAGE_USER_PROMPT } from './receipt.prompt';
import type { ExtractionResult, ReceiptExtractor } from './receipt-extractor.port';

const DEFAULT_MODEL = 'claude-haiku-4-5';
/** The JSON response runs about 150 tokens; this is a ceiling, not a target. */
const DEFAULT_MAX_TOKENS = 400;
/** OCR text for one receipt is short — anything longer is a bad read, not a receipt. */
const MAX_OCR_TEXT_CHARS = 4000;

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const SUPPORTED_MEDIA: SupportedMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

@Injectable()
export class ClaudeReceiptExtractor implements ReceiptExtractor {
  private readonly logger = new Logger(ClaudeReceiptExtractor.name);
  private client: Anthropic | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Reads the fields out of OCR text. This is the cheap tier: roughly 400 input
   * tokens, and the screenshot itself never leaves the machine.
   */
  async extractFromText(ocrText: string): Promise<ExtractionResult> {
    const trimmed = ocrText.slice(0, MAX_OCR_TEXT_CHARS);
    return this.call([{ type: 'text', text: `${TEXT_USER_PREFIX}${trimmed}` }], 'text');
  }

  /**
   * Reads the fields straight off the image. Only reached when OCR could not
   * produce usable text, because it costs roughly four times the text tier and
   * is the one path where the receipt is sent off the machine.
   */
  async extractFromImage(image: Buffer, mimeType: string): Promise<ExtractionResult> {
    const mediaType = (SUPPORTED_MEDIA as string[]).includes(mimeType)
      ? (mimeType as SupportedMediaType)
      : 'image/jpeg';

    return this.call(
      [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: image.toString('base64') },
        },
        { type: 'text', text: IMAGE_USER_PROMPT },
      ],
      'image',
    );
  }

  private async call(
    content: Anthropic.ContentBlockParam[],
    tier: 'text' | 'image',
  ): Promise<ExtractionResult> {
    const client = this.getClient();
    const model = this.configService.get<string>('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
    const maxTokens = Number(this.configService.get('ANTHROPIC_MAX_TOKENS') ?? DEFAULT_MAX_TOKENS);

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: RECEIPT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      // Constrains the reply to the schema, so there is no prose to strip and
      // no retry loop for malformed JSON.
      output_config: { format: { type: 'json_schema', schema: RECEIPT_JSON_SCHEMA } },
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    this.logger.log(
      `Receipt read via ${tier} tier: ${usage.inputTokens} in / ${usage.outputTokens} out tokens`,
    );

    if (response.stop_reason === 'refusal') {
      throw new ServiceUnavailableException('El lector rechazó la imagen del comprobante');
    }

    const extraction = this.parseResponse(response);
    return { extraction, usage };
  }

  private parseResponse(response: Anthropic.Message): RawReceiptExtraction {
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!textBlock) {
      throw new ServiceUnavailableException('El lector no devolvió contenido');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      // Should be unreachable with a json_schema output format; if it happens
      // the contract changed and we want to know rather than guess.
      this.logger.error(`Reader returned non-JSON: ${textBlock.text.slice(0, 200)}`);
      throw new ServiceUnavailableException('El lector devolvió una respuesta ilegible');
    }

    if (!isRawReceiptExtraction(parsed)) {
      this.logger.error(`Reader returned an unexpected shape: ${textBlock.text.slice(0, 200)}`);
      throw new ServiceUnavailableException('El lector devolvió campos inesperados');
    }

    return parsed;
  }

  private getClient(): Anthropic {
    if (this.client) return this.client;

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'ANTHROPIC_API_KEY no está configurada: el respaldo de lectura está deshabilitado',
      );
    }

    this.client = new Anthropic({ apiKey });
    return this.client;
  }
}
