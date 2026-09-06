/**
 * Creates one treasury account with its receipt identifiers.
 *
 * Identifiers are how an incoming screenshot is matched to one of your own
 * accounts, which is what makes in/out detection deterministic. A bank account
 * is recognised by the masked last four digits; a pago movil account by phone.
 *
 *   npx ts-node -P tsconfig.json --transpile-only scripts/seed-account.ts \
 *     <companyId> '<json>'
 *
 * where <json> matches the account schema, e.g.
 *   {"name":"BDV Bs","kind":"bank","currency":"VES",
 *    "identifiers":[{"kind":"last4","value":"5678","bankCode":"0102"},
 *                   {"kind":"phone","value":"04120000000"}]}
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AccountsService } from '../src/modules/treasury/accounts.service';
import { accountSchema } from '@cryotech/shared-types';

async function main() {
  const [companyId, rawJson] = process.argv.slice(2);
  if (!companyId || !rawJson) {
    throw new Error("usage: seed-account.ts <companyId> '<json>'");
  }

  const input = accountSchema.parse(JSON.parse(rawJson));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const account = await app.get(AccountsService).create(companyId, input);
    console.log(`${account.code}  ${account.name}  (${account.currency})`);
    for (const identifier of account.identifiers) {
      console.log(`   ${identifier.kind.padEnd(8)} ${identifier.value}${identifier.bankCode ? ` @${identifier.bankCode}` : ''}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
