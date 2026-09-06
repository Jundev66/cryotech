import { Injectable } from '@nestjs/common';
import { AccountsService } from '../../treasury/accounts.service';
import type { AccountRef } from '../../receipt-ocr/patterns';
import type { ResolvedDirection } from '../types/assistant.types';

/**
 * Works out whether money came in or went out, by checking which side of the
 * receipt names one of our own accounts.
 *
 * This is the part people expect to need AI and does not: it is a lookup
 * against `account_identifiers`, so it is exact, explainable, and free. The
 * reader only transcribes the account strings; the decision is made here.
 */
@Injectable()
export class DirectionResolver {
  constructor(private readonly accounts: AccountsService) {}

  async resolve(
    companyId: string,
    origin: AccountRef | null,
    destination: AccountRef | null,
  ): Promise<ResolvedDirection> {
    const [originAccount, destinationAccount] = await Promise.all([
      this.lookup(companyId, origin),
      this.lookup(companyId, destination),
    ]);

    if (originAccount && destinationAccount) {
      return {
        direction: 'internal',
        ourAccountId: originAccount.id,
        ourAccountName: originAccount.name,
        counterAccountId: destinationAccount.id,
        counterAccountName: destinationAccount.name,
      };
    }

    if (originAccount) {
      return {
        direction: 'out',
        ourAccountId: originAccount.id,
        ourAccountName: originAccount.name,
        counterAccountId: null,
        counterAccountName: null,
      };
    }

    if (destinationAccount) {
      return {
        direction: 'in',
        ourAccountId: destinationAccount.id,
        ourAccountName: destinationAccount.name,
        counterAccountId: null,
        counterAccountName: null,
      };
    }

    return {
      direction: 'unknown',
      ourAccountId: null,
      ourAccountName: null,
      counterAccountId: null,
      counterAccountName: null,
    };
  }

  private lookup(companyId: string, ref: AccountRef | null) {
    if (!ref) return Promise.resolve(null);
    return this.accounts.resolveByIdentifier(companyId, {
      last4: ref.last4,
      phone: ref.phone,
      bankCode: ref.bankCode,
    });
  }
}
