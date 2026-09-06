import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWorker, type Worker } from 'tesseract.js';
import { preprocessReceipt } from './preprocess.util';
import { parseReceiptText, missingCriticalFields } from './label-parser';
import {
  EMPTY_FIELDS,
  parseAccountRef,
  parseAmount,
  parseCurrency,
  parseDate,
  parseReference,
  BANK_NAMES,
  type ReceiptFields,
} from './patterns';
import {
  RECEIPT_EXTRACTOR,
  type ExtractionUsage,
  type ReceiptExtractor,
} from '../ai/receipt-extractor.port';
import type { RawReceiptExtraction } from '../ai/receipt.schema';

/** Which rung of the ladder produced the fields. */
export type ReaderTier = 'ocr' | 'ai_text' | 'ai_image' | 'failed';

export interface ReadReceiptResult {
  fields: ReceiptFields;
  tier: ReaderTier;
  /** Everything Tesseract read, kept on the draft for the audit trail. */
  ocrText: string;
  ocrConfidence: number;
  missing: string[];
  usage: ExtractionUsage | null;
  wasInverted: boolean;
}

const DEFAULT_MIN_CONFIDENCE = 70;

/** Does the OCR text hold anything that could plausibly be this field? */
const FIELD_EVIDENCE: Record<string, RegExp> = {
  // A money figure always carries a decimal separator.
  amount: /\d[.,]\d{2}/,
  reference: /\d{6,}/,
  date: /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/,
  // A masked account tail or a Venezuelan mobile number.
  account: /[*xX]{2,}\s*\d{4}|\b0?4(?:12|14|16|24|26)\d{7}\b|\d{4}\s*[*xX-]{2,}\s*\d{4}/,
};

/**
 * Whether the text tier is worth spending tokens on.
 *
 * The text reader can only recover a field that is actually somewhere in the
 * OCR output. On a dark-theme receipt the amount pill often degrades to noise,
 * so the digits simply are not there — sending that text to the model burns
 * ~1000 tokens and still comes back empty, and we pay for the image tier
 * anyway. Only take the cheap rung when every missing field has a candidate.
 */
function textCouldContain(missing: string[], ocrText: string): boolean {
  return missing.every((field) => {
    const evidence = FIELD_EVIDENCE[field];
    return evidence ? evidence.test(ocrText) : true;
  });
}

@Injectable()
export class ReceiptReaderService implements OnModuleDestroy {
  private readonly logger = new Logger(ReceiptReaderService.name);
  private workerPromise: Promise<Worker> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(RECEIPT_EXTRACTOR) private readonly extractor: ReceiptExtractor,
  ) {}

  /**
   * Reads a receipt screenshot, cheapest tier first.
   *
   *   1. Tesseract locally — free, and the image never leaves the machine.
   *   2. The AI reader over the OCR *text* — a few hundred tokens, image stays put.
   *   3. The AI reader over the image — the only tier that sends the receipt out.
   *
   * Whichever tier answers, the strings go through the same validators, so a
   * misread has to survive identical checks either way.
   */
  async read(image: Buffer, today = new Date()): Promise<ReadReceiptResult> {
    const prepared = await preprocessReceipt(image);

    let ocrText = '';
    let ocrConfidence = 0;
    try {
      const worker = await this.getWorker();
      const { data } = await worker.recognize(prepared.ocrImage);
      ocrText = data.text ?? '';
      ocrConfidence = data.confidence ?? 0;
    } catch (error) {
      this.logger.error('Tesseract failed; falling through to the AI reader', error as Error);
    }

    const localFields = parseReceiptText(ocrText, today);
    let missing = missingCriticalFields(localFields);

    if (missing.length === 0) {
      this.logger.log(`Receipt read locally (confidence ${ocrConfidence.toFixed(0)})`);
      return {
        fields: localFields,
        tier: 'ocr',
        ocrText,
        ocrConfidence,
        missing,
        usage: null,
        wasInverted: prepared.wasInverted,
      };
    }

    if (this.configService.get('OCR_FALLBACK_ENABLED') === 'false') {
      this.logger.warn(`Local read incomplete (${missing.join(', ')}) and the AI fallback is disabled`);
      return {
        fields: localFields,
        tier: 'failed',
        ocrText,
        ocrConfidence,
        missing,
        usage: null,
        wasInverted: prepared.wasInverted,
      };
    }

    const minConfidence = Number(
      this.configService.get('OCR_MIN_CONFIDENCE') ?? DEFAULT_MIN_CONFIDENCE,
    );
    const textIsUsable =
      ocrText.trim().length > 40 &&
      ocrConfidence >= minConfidence &&
      textCouldContain(missing, ocrText);

    if (textIsUsable) {
      this.logger.log(`Local read missing ${missing.join(', ')} — escalating to the text tier`);
      try {
        const { extraction, usage } = await this.extractor.extractFromText(ocrText);
        const merged = this.merge(localFields, this.toFields(extraction, today));
        missing = missingCriticalFields(merged);
        if (missing.length === 0) {
          return {
            fields: merged,
            tier: 'ai_text',
            ocrText,
            ocrConfidence,
            missing,
            usage,
            wasInverted: prepared.wasInverted,
          };
        }
        this.logger.warn(`Text tier still missing ${missing.join(', ')} — escalating to the image tier`);
      } catch (error) {
        this.logger.error('Text tier failed; escalating to the image tier', error as Error);
      }
    } else {
      this.logger.warn(
        `Skipping the text tier (confidence ${ocrConfidence.toFixed(0)}, missing ${missing.join(', ')}) — going straight to the image tier`,
      );
    }

    try {
      const { extraction, usage } = await this.extractor.extractFromImage(
        prepared.aiImage,
        prepared.aiMimeType,
      );
      const merged = this.merge(localFields, this.toFields(extraction, today));
      return {
        fields: merged,
        tier: 'ai_image',
        ocrText,
        ocrConfidence,
        missing: missingCriticalFields(merged),
        usage,
        wasInverted: prepared.wasInverted,
      };
    } catch (error) {
      this.logger.error('Image tier failed — the receipt could not be read', error as Error);
      return {
        fields: localFields,
        tier: 'failed',
        ocrText,
        ocrConfidence,
        missing,
        usage: null,
        wasInverted: prepared.wasInverted,
      };
    }
  }

  /**
   * Runs the AI reader's transcriptions through the same validators the local
   * path uses. The model transcribes; nothing it returns becomes a number or a
   * date without passing these checks.
   */
  private toFields(extraction: RawReceiptExtraction, today: Date): ReceiptFields {
    const fields: ReceiptFields = { ...EMPTY_FIELDS };

    if (extraction.amountText) {
      fields.amount = parseAmount(extraction.amountText);
      fields.currency = parseCurrency(extraction.amountText);
    }
    if (extraction.dateText) fields.date = parseDate(extraction.dateText, today);
    if (extraction.referenceText) fields.reference = parseReference(extraction.referenceText);
    if (extraction.originText) fields.originAccount = parseAccountRef(extraction.originText);
    if (extraction.destinationText) {
      fields.destinationAccount = parseAccountRef(extraction.destinationText);
    }
    if (extraction.counterpartyText) {
      fields.counterparty = extraction.counterpartyText.replace(/\s+/g, ' ').trim().slice(0, 120);
    }
    if (extraction.conceptText) fields.concept = extraction.conceptText.slice(0, 200);

    const code = fields.originAccount?.bankCode ?? fields.destinationAccount?.bankCode;
    fields.bankName = (code && BANK_NAMES[code]) || extraction.bankText.trim() || null;

    return fields;
  }

  /** Local reads win where they exist: they were validated against the raw pixels. */
  private merge(local: ReceiptFields, remote: ReceiptFields): ReceiptFields {
    return {
      amount: local.amount ?? remote.amount,
      currency: local.currency ?? remote.currency,
      date: local.date ?? remote.date,
      reference: local.reference ?? remote.reference,
      counterparty: local.counterparty ?? remote.counterparty,
      originAccount: local.originAccount ?? remote.originAccount,
      destinationAccount: local.destinationAccount ?? remote.destinationAccount,
      concept: local.concept ?? remote.concept,
      bankName: local.bankName ?? remote.bankName,
    };
  }

  /**
   * Loads the worker at boot instead of on the first receipt.
   *
   * Creating it lazily meant the first screenshot after every restart also paid
   * for the 3.3 MB of Spanish traineddata — several seconds, on the one message
   * most likely to be someone testing whether the bot still works.
   */
  onModuleInit() {
    void this.getWorker().catch((error) =>
      this.logger.warn(
        `Tesseract warm-up failed; the first receipt will pay for it: ${(error as Error)?.message}`,
      ),
    );
  }

  /**
   * One worker for the process. Spinning one up per receipt would re-load the
   * Spanish traineddata every time, which dominates the runtime.
   */
  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      const lang = this.configService.get<string>('OCR_LANG') ?? 'spa';
      // Cleared on failure: a rejected promise left in the field would make
      // every later receipt fail for the life of the process, and warming up at
      // boot makes a transient failure here far likelier than it used to be.
      this.workerPromise = createWorker(lang).catch((error) => {
        this.workerPromise = null;
        throw error;
      });
    }
    return this.workerPromise;
  }

  async onModuleDestroy() {
    if (!this.workerPromise) return;
    try {
      const worker = await this.workerPromise;
      await worker.terminate();
    } catch {
      // Shutting down; a worker that never came up is not worth reporting.
    }
  }
}
