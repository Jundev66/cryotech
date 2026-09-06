import { z } from 'zod';

export const BREEDS = ['Cobb 500', 'Ross 308', 'Hubbard', 'Otro'] as const;
export const BATCH_STATUSES = ['planned', 'breeding', 'for_sale', 'finished'] as const;

export const batchEntryLineSchema = z.object({
  productId: z.string().uuid('Seleccione un producto'),
  quantity: z.coerce.number().positive('Cantidad debe ser positiva'),
  costPerUnit: z.coerce.number().nonnegative('Costo no puede ser negativo').optional(),
  deliveryCost: z.coerce.number().nonnegative('Costo de envio no puede ser negativo').optional(),
  notes: z.string().optional(),
});

export const batchSchema = z.object({
  warehouseId: z.string().uuid('Seleccione un galpón'),
  breed: z.string().min(1, 'Raza es requerida'),
  startDate: z.string().min(1, 'Fecha de inicio es requerida'),
  initialQuantity: z.coerce.number().int().positive('Cantidad debe ser positiva'),
  purchasePricePerUnit: z.coerce.number().nonnegative('Precio no puede ser negativo').optional(),
  notes: z.string().optional(),
});

export const batchWithEntriesSchema = batchSchema.extend({
  entryLines: z.array(batchEntryLineSchema).optional(),
});

export const dailyLogSchema = z.object({
  batchId: z.string().uuid(),
  logDate: z.string().min(1, 'Fecha es requerida'),
  waterConsumedL: z.coerce.number().nonnegative('No puede ser negativo').optional(),
  mortality: z.coerce.number().int().nonnegative('No puede ser negativo'),
  averageWeightG: z.coerce.number().positive('Peso debe ser positivo').optional(),
  temperatureC: z.coerce.number().optional(),
  humidityPct: z.coerce.number().min(0).max(100).optional(),
  medicineAdministered: z.boolean().optional(),
  medicineNotes: z.string().optional(),
  medicineProductId: z.string().uuid().optional(),
  medicineQuantity: z.coerce.number().positive('Cantidad debe ser positiva').optional(),
  feedConsumedKg: z.coerce.number().nonnegative('Consumo no puede ser negativo').optional(),
  feedProductId: z.string().uuid().optional(),
  healthScore: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

/**
 * Status transitions come in as their own body, so the enum is the validation.
 * It used to be a bare `{ status: string }`, which let any string reach the
 * column and stick — including one no screen knows how to render.
 */
export const batchStatusUpdateSchema = z.object({
  status: z.enum(BATCH_STATUSES),
});

export type BatchInput = z.infer<typeof batchSchema>;
export type BatchStatusUpdateInput = z.infer<typeof batchStatusUpdateSchema>;
export type BatchWithEntriesInput = z.infer<typeof batchWithEntriesSchema>;
export type BatchEntryLineInput = z.infer<typeof batchEntryLineSchema>;
export type DailyLogInput = z.input<typeof dailyLogSchema>;
