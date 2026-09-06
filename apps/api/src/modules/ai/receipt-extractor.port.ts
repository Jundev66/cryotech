import type { RawReceiptExtraction } from './receipt.schema';

export interface ExtractionUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractionResult {
  extraction: RawReceiptExtraction;
  usage: ExtractionUsage | null;
}

/**
 * The reader's escape hatch. Two entry points, cheapest first:
 * `extractFromText` when OCR read the receipt but the label parser could not
 * map it (the image never leaves the machine), `extractFromImage` only when
 * OCR itself failed.
 */
export interface ReceiptExtractor {
  extractFromText(ocrText: string): Promise<ExtractionResult>;
  extractFromImage(image: Buffer, mimeType: string): Promise<ExtractionResult>;
}

export const RECEIPT_EXTRACTOR = Symbol('RECEIPT_EXTRACTOR');
