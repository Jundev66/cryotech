import { z } from 'zod';

export const ACCOUNT_KINDS = ['bank', 'cash', 'digital'] as const;
export const ACCOUNT_CURRENCIES = ['VES', 'USD'] as const;
export const MOVEMENT_DIRECTIONS = ['in', 'out'] as const;
export const ACCOUNT_IDENTIFIER_KINDS = ['last4', 'phone', 'document'] as const;

/**
 * Normalizes a phone number to its last 10 digits so the same account is
 * recognised whether a receipt prints it as `0412-0000000`, `+584120000000`
 * or `412 113 3412`.
 */
export function normalizePhoneIdentifier(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-10);
}

/** Strips everything but digits and keeps the last four — receipts mask the middle. */
export function normalizeLast4Identifier(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-4);
}

export function normalizeIdentifierValue(
  kind: (typeof ACCOUNT_IDENTIFIER_KINDS)[number],
  raw: string,
): string {
  if (kind === 'phone') return normalizePhoneIdentifier(raw);
  if (kind === 'last4') return normalizeLast4Identifier(raw);
  return raw.replace(/\s+/g, '').toUpperCase();
}

export const accountIdentifierSchema = z.object({
  kind: z.enum(ACCOUNT_IDENTIFIER_KINDS),
  value: z.string().min(3, 'Identificador demasiado corto'),
  bankCode: z.string().regex(/^\d{4}$/, 'El código de banco son 4 dígitos').optional().nullable(),
});

export const accountSchema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.enum(ACCOUNT_CURRENCIES),
  code: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
  identifiers: z.array(accountIdentifierSchema).default([]),
});

export const accountUpdateSchema = accountSchema.partial();

export const accountMovementSchema = z.object({
  accountId: z.string().uuid('Seleccione una cuenta'),
  direction: z.enum(MOVEMENT_DIRECTIONS),
  amount: z.coerce.number().positive('Monto debe ser positivo'),
  movementDate: z.string().optional(),
  reference: z.string().optional(),
  counterparty: z.string().optional(),
  concept: z.string().optional(),
  notes: z.string().optional(),
});

export const internalTransferSchema = z.object({
  fromAccountId: z.string().uuid('Seleccione la cuenta de origen'),
  toAccountId: z.string().uuid('Seleccione la cuenta de destino'),
  amount: z.coerce.number().positive('Monto debe ser positivo'),
  movementDate: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const fxTradeSchema = z
  .object({
    fromAccountId: z.string().uuid('Seleccione la cuenta de origen'),
    toAccountId: z.string().uuid('Seleccione la cuenta de destino'),
    amountFrom: z.coerce.number().positive('Monto de origen debe ser positivo'),
    amountTo: z.coerce.number().positive('Monto de destino debe ser positivo'),
    tradeDate: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: 'Las cuentas de origen y destino deben ser distintas',
    path: ['toAccountId'],
  });

export type AccountInput = z.infer<typeof accountSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
export type AccountIdentifierInput = z.infer<typeof accountIdentifierSchema>;
export type AccountMovementInput = z.infer<typeof accountMovementSchema>;
export type InternalTransferInput = z.infer<typeof internalTransferSchema>;
export type FxTradeInput = z.infer<typeof fxTradeSchema>;
