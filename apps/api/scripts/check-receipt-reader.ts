/**
 * Runs the receipt reader over the fixture screenshots and reports which tier
 * resolved each one, what it extracted, and what the AI tiers cost in tokens.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/check-receipt-reader.ts [file...]
 *
 * With no arguments it reads every image in test/fixtures.
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { ReceiptReaderService } from '../src/modules/receipt-ocr/receipt-reader.service';

const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures');

async function main() {
  const args = process.argv.slice(2);
  const files =
    args.length > 0
      ? args
      : readdirSync(FIXTURE_DIR)
          .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
          .map((f) => join(FIXTURE_DIR, f));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const reader = app.get(ReceiptReaderService);

  try {
    for (const file of files) {
      console.log(`\n${'='.repeat(70)}\n${file.split('/').pop()}`);
      const started = Date.now();
      const result = await reader.read(readFileSync(file));
      const elapsed = Date.now() - started;

      console.log(`  escalón      : ${result.tier}`);
      console.log(`  confianza OCR: ${result.ocrConfidence.toFixed(0)}`);
      console.log(`  invertida    : ${result.wasInverted ? 'sí (tema oscuro)' : 'no'}`);
      console.log(`  tiempo       : ${elapsed} ms`);
      if (result.usage) {
        console.log(`  tokens       : ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`);
      }
      if (result.missing.length) {
        console.log(`  FALTAN       : ${result.missing.join(', ')}`);
      }

      const f = result.fields;
      console.log('  --- campos ---');
      console.log(`  monto        : ${f.amount} ${f.currency ?? ''}`);
      console.log(`  fecha        : ${f.date}`);
      console.log(`  referencia   : ${f.reference}`);
      console.log(`  contraparte  : ${f.counterparty}`);
      console.log(`  origen       : ${JSON.stringify(f.originAccount)}`);
      console.log(`  destino      : ${JSON.stringify(f.destinationAccount)}`);
      console.log(`  concepto     : ${f.concept}`);
      console.log(`  banco        : ${f.bankName}`);

      if (process.env.SHOW_OCR === 'true') {
        console.log('  --- texto OCR ---');
        console.log(result.ocrText.split('\n').map((l) => `  | ${l}`).join('\n'));
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
