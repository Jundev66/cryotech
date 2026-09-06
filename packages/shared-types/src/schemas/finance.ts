import { z } from 'zod';

export const EXPENSE_CATEGORIES = [
  'feed', 'vaccine', 'chicks', 'utility', 'labor', 'transport', 'other', 'owner_draw'
] as const;

export const INCOME_CATEGORIES = [
  'sale_live', 'sale_dead', 'other', 'capital_in'
] as const;

/**
 * Owner capital movements. They are cash flow, not operating results:
 * exclude them from revenue, expenses and profitability figures.
 */
export const CAPITAL_CATEGORIES = ['capital_in', 'owner_draw'] as const;

export const transactionSchema = z.object({
  batchId: z.string().uuid().optional(),
  type: z.enum(['income', 'expense']),
  category: z.string().min(1, 'Categoría es requerida'),
  amount: z.coerce.number().positive('Monto debe ser positivo'),
  amountBs: z.coerce.number().positive('Monto en Bs debe ser positivo').optional(),
  exchangeRate: z.coerce.number().positive('Tasa debe ser positiva').optional(),
  description: z.string().optional(),
  transactionDate: z.string().optional(),
});

export const saleSchema = z.object({
  batchId: z.string().uuid('Seleccione un lote'),
  clientId: z.string().uuid().optional(),
  saleType: z.enum(['live', 'dead'], { errorMap: () => ({ message: 'Seleccione tipo de venta' }) }),
  quantity: z.coerce.number().int().positive('Cantidad debe ser positiva'),
  weightKg: z.coerce.number().positive('Peso debe ser positivo').optional(),
  pricePerKg: z.coerce.number().positive('Precio debe ser positivo').optional(),
  pricePerUnit: z.coerce.number().positive('Precio debe ser positivo').optional(),
  totalAmount: z.coerce.number().nonnegative('Total no puede ser negativo'),
  pricePerKgBs: z.coerce.number().positive('Precio en Bs debe ser positivo').optional(),
  totalAmountBs: z.coerce.number().nonnegative('Total en Bs no puede ser negativo').optional(),
  exchangeRate: z.coerce.number().positive('Tasa debe ser positiva').optional(),
  dueDate: z.string().optional(),
  // Without this the validation pipe strips the date the client already sends,
  // and every sale lands on today — making it impossible to record "the sale
  // from yesterday".
  saleDate: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * One row of a multi-sale: everything a sale needs except the batch, which
 * lives on the envelope because every row comes out of the same one.
 */
export const bulkSaleItemSchema = saleSchema
  .omit({ batchId: true, saleDate: true })
  .extend({
    // Required here, unlike a lone sale: the whole point of the screen is one
    // sale per client, and a row without a client is a row you cannot tell
    // apart from the next one.
    clientId: z.string().uuid('Seleccione un cliente'),
  });

export const bulkSaleSchema = z.object({
  batchId: z.string().uuid('Seleccione un lote'),
  saleDate: z.string().optional(),
  items: z
    .array(bulkSaleItemSchema)
    .min(1, 'Agregue al menos una venta')
    // Bounds the transaction. Fifty sales off one batch in a single sitting is
    // already far past what a delivery round looks like.
    .max(50, 'Máximo 50 ventas a la vez'),
});

export const salePaymentSchema = z.object({
  amount: z.coerce.number().positive('Monto debe ser positivo'),
  amountBs: z.coerce.number().positive('Monto en Bs debe ser positivo').optional(),
  exchangeRate: z.coerce.number().positive('Tasa debe ser positiva').optional(),
  paymentDate: z.string().optional(),
  /** Treasury account the money landed in, when known. */
  accountId: z.string().uuid().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const exchangeRateConfigSchema = z.object({
  rateSource: z.enum(['bcv', 'parallel', 'custom']),
  customRate: z.coerce.number().positive('Tasa debe ser positiva').optional(),
  autoFetch: z.boolean().default(true),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export type BulkSaleItemInput = z.infer<typeof bulkSaleItemSchema>;
export type BulkSaleInput = z.infer<typeof bulkSaleSchema>;
export type SalePaymentInput = z.infer<typeof salePaymentSchema>;
export type ExchangeRateConfigInput = z.infer<typeof exchangeRateConfigSchema>;
