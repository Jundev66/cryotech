import api from './client';

export type AccountKind = 'bank' | 'cash' | 'digital';
export type AccountCurrency = 'VES' | 'USD';
export type IdentifierKind = 'last4' | 'phone' | 'document';

export interface AccountIdentifier {
  id: string;
  kind: IdentifierKind;
  value: string;
  bankCode: string | null;
}

export interface Account {
  id: string;
  code: string | null;
  name: string;
  kind: AccountKind;
  currency: AccountCurrency;
  currentBalance: string;
  isActive: boolean;
  notes: string | null;
  identifiers: AccountIdentifier[];
}

export interface AccountMovement {
  id: string;
  accountId: string;
  direction: 'in' | 'out';
  amount: string;
  currency: AccountCurrency;
  movementDate: string;
  reference: string | null;
  counterparty: string | null;
  concept: string | null;
  sourceType: string | null;
  transferGroupId: string | null;
  account: { id: string; name: string; currency: AccountCurrency };
}

export interface AccountPayload {
  name: string;
  kind: AccountKind;
  currency: AccountCurrency;
  isActive: boolean;
  notes?: string;
  identifiers: Array<{ kind: IdentifierKind; value: string; bankCode?: string | null }>;
}

export interface ReconcileReport {
  checked: number;
  applied: boolean;
  mismatches: Array<{ id: string; name: string; stored: string; computed: string; drift: string }>;
}

export const treasuryApi = {
  listAccounts: (includeInactive = false) =>
    api
      .get<Account[]>('/treasury/accounts', { params: { includeInactive } })
      .then((r) => r.data),

  createAccount: (data: AccountPayload) =>
    api.post<Account>('/treasury/accounts', data).then((r) => r.data),

  updateAccount: (id: string, data: Partial<AccountPayload>) =>
    api.patch<Account>(`/treasury/accounts/${id}`, data).then((r) => r.data),

  removeAccount: (id: string) => api.delete(`/treasury/accounts/${id}`).then((r) => r.data),

  listMovements: (params?: { accountId?: string; limit?: number; search?: string }) =>
    api.get<AccountMovement[]>('/treasury/movements', { params }).then((r) => r.data),

  /**
   * Records a movement by hand. Also how an opening balance is entered: the
   * balance is derived from the ledger, so writing the number directly would
   * leave the account permanently out of step with its movements.
   */
  createMovement: (data: {
    accountId: string;
    direction: 'in' | 'out';
    amount: number;
    movementDate?: string;
    reference?: string;
    counterparty?: string;
    concept?: string;
  }) => api.post<AccountMovement>('/treasury/movements', data).then((r) => r.data),

  transfer: (data: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    movementDate?: string;
    reference?: string;
  }) => api.post('/treasury/transfers', data).then((r) => r.data),

  fxTrade: (data: {
    fromAccountId: string;
    toAccountId: string;
    amountFrom: number;
    amountTo: number;
    tradeDate?: string;
    reference?: string;
  }) => api.post('/treasury/fx-trades', data).then((r) => r.data),

  reconcile: (apply = false) =>
    api.post<ReconcileReport>('/treasury/reconcile', {}, { params: { apply } }).then((r) => r.data),
};
