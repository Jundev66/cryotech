import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EMPTY_EXTRACTION, isRawReceiptExtraction, type RawReceiptExtraction } from './receipt.schema';
import type { ExtractionResult, ReceiptExtractor } from './receipt-extractor.port';

const FIXTURE_PATH = join(process.cwd(), 'test', 'fixtures', 'ai-receipt.json');

/**
 * Stand-in for the AI reader, selected with `ASSISTANT_FAKE_AI=true`.
 *
 * Lets the whole pipeline — resolution, drafts, confirmation, execution — be
 * exercised deterministically and for free. Reads `test/fixtures/ai-receipt.json`
 * when present so a check can pin the exact fields it expects.
 */
@Injectable()
export class FakeReceiptExtractor implements ReceiptExtractor {
  private readonly logger = new Logger(FakeReceiptExtractor.name);

  async extractFromText(): Promise<ExtractionResult> {
    return { extraction: this.load(), usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async extractFromImage(): Promise<ExtractionResult> {
    return { extraction: this.load(), usage: { inputTokens: 0, outputTokens: 0 } };
  }

  private load(): RawReceiptExtraction {
    if (!existsSync(FIXTURE_PATH)) {
      this.logger.warn(`No fixture at ${FIXTURE_PATH} — returning empty extraction`);
      return { ...EMPTY_EXTRACTION };
    }

    try {
      const parsed: unknown = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
      if (!isRawReceiptExtraction(parsed)) {
        this.logger.error(`Fixture at ${FIXTURE_PATH} does not match the extraction shape`);
        return { ...EMPTY_EXTRACTION };
      }
      return parsed;
    } catch (error) {
      this.logger.error(`Could not read fixture at ${FIXTURE_PATH}`, error as Error);
      return { ...EMPTY_EXTRACTION };
    }
  }
}
