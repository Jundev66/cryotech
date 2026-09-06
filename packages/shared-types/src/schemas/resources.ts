import { z } from 'zod';

export const PRODUCT_TYPES = ['consumable', 'equipment'] as const;

export const clientSchema = z.object({
  name: z.string().min(2, 'Nombre es requerido'),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const productSchema = z.object({
  name: z.string().min(2, 'Nombre es requerido'),
  categoryId: z.string().uuid('Categoría es requerida'),
  productType: z.enum(['consumable', 'equipment']).default('consumable'),
  unitId: z.string().uuid('Unidad es requerida'),
  currentStock: z.coerce.number().nonnegative('Stock no puede ser negativo'),
  minStock: z.coerce.number().nonnegative('Stock mínimo no puede ser negativo'),
});

/** view / create / edit / delete — the shape of almost every module. */
const crudPermission = z.object({
  view: z.boolean(),
  create: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
});

/**
 * Permisos de un rol.
 *
 * `.strict()`: an unknown key is someone probing, and a role is exactly where
 * that cannot pass in silence. The `{"all": true}` wildcard is now rejected at
 * the door instead of ending up in the JSON column.
 *
 * `.partial()`: every module is optional. A role missing a module simply does
 * not have that permission — `PermissionGuard` denies by default — so roles
 * created before a module existed stay editable.
 *
 * The list has to cover **every** module in `PERMISSIONS_MODULES`, or the form
 * sends a key the schema does not know. `treasury` was missing: since Zod drops
 * unknown keys by default, ticking its boxes looked like it worked and the
 * permission was lost on save.
 */
export const rolePermissionsSchema = z
  .object({
    batches: crudPermission,
    daily_logs: crudPermission,
    sales: crudPermission,
    transactions: crudPermission,
    entries: crudPermission,
    processing: crudPermission,
    clients: crudPermission,
    products: crudPermission,
    warehouses: crudPermission,
    treasury: crudPermission,
    reports: z.object({ view: z.boolean() }),
    settings: z.object({ view: z.boolean(), edit: z.boolean() }),
    users: crudPermission,
  })
  .partial()
  .strict();

export const roleSchema = z
  .object({
    name: z.string().min(2, 'Nombre del rol es requerido').max(60),
    permissions: rolePermissionsSchema,
  })
  .strict();

/** The same with everything optional: a PATCH may send only the name. */
export const roleUpdateSchema = roleSchema.partial();

export const feedFormulaSchema = z.object({
  breed: z.string().min(1, 'Raza es requerida'),
  weekNumber: z.coerce.number().int().min(1).max(10, 'Semana entre 1 y 10'),
  dailyFeedPerBirdG: z.coerce.number().positive('Gramos por ave debe ser positivo'),
  feedPhase: z.enum(['inicio', 'engorde']).optional(),
  notes: z.string().optional(),
});

/**
 * Money paid against something owed — a purchase or a processing job. Mirrors
 * salePaymentSchema, which is the same idea pointing the other way.
 *
 * The payable itself is identified by the route, not the body.
 */
export const payablePaymentSchema = z.object({
  amount: z.coerce.number().positive('Monto debe ser positivo'),
  currency: z.enum(['VES', 'USD']).default('VES'),
  exchangeRate: z.coerce.number().positive('Tasa debe ser positiva').optional(),
  paymentDate: z.string().optional(),
  accountId: z.string().uuid().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export type PayablePaymentInput = z.infer<typeof payablePaymentSchema>;

export const payableKindSchema = z.enum(['entry', 'processing']);

export type PayableKind = z.infer<typeof payableKindSchema>;

export const productEntrySchema = z.object({
  productId: z.string().uuid('Seleccione un producto'),
  batchId: z.string().uuid().optional(),
  quantity: z.coerce.number().positive('Cantidad debe ser positiva'),
  totalCost: z.coerce.number().nonnegative('Costo total no puede ser negativo').optional(),
  deliveryCost: z.coerce.number().nonnegative('Costo de envio no puede ser negativo').optional(),
  entryDate: z.string().min(1, 'Fecha es requerida'),
  notes: z.string().optional(),
});

export const processingSchema = z.object({
  batchId: z.string().uuid('Seleccione un lote'),
  quantity: z.coerce.number().int().positive('Cantidad debe ser positiva'),
  liveWeightKg: z.coerce.number().positive('Peso debe ser positivo').optional(),
  processedWeightKg: z.coerce.number().positive('Peso debe ser positivo').optional(),
  weightAdjustmentG: z.coerce.number().nonnegative('Ajuste no puede ser negativo').default(0),
  isSelfProcessed: z.boolean().default(false),
  costPerBird: z.coerce.number().nonnegative().optional(),
  costPerKg: z.coerce.number().nonnegative().optional(),
  /** In dollars — unlike a purchase, whose totalCost is in bolivares. */
  totalCost: z.coerce.number().nonnegative('Costo total es requerido'),
  totalCostBs: z.coerce.number().nonnegative('Costo en Bs no puede ser negativo').optional(),
  exchangeRate: z.coerce.number().positive('Tasa debe ser positiva').optional(),
  /** Who did the slaughtering. Empty when it was done in-house. */
  supplierName: z.string().optional(),
  productId: z.string().uuid().optional(),
  processingDate: z.string().optional(),
  notes: z.string().optional(),
});

export const productConsumptionSchema = z.object({
  batchId: z.string().uuid('Seleccione un lote'),
  productId: z.string().uuid('Seleccione un producto'),
  consumptionDate: z.string().min(1, 'Fecha es requerida'),
  quantity: z.coerce.number().positive('Cantidad debe ser positiva'),
  notes: z.string().optional(),
});

export const feedPhaseConfigSchema = z.object({
  breed: z.string().min(1, 'Raza es requerida'),
  engordeStartWeek: z.coerce.number().int().min(1).max(10).default(4),
});

/** Feed booked against a batch. Consumes stock, so the numbers are bounded. */
export const feedConsumptionSchema = z.object({
  batchId: z.string().uuid('Seleccione un lote'),
  productId: z.string().uuid('Seleccione un producto'),
  consumptionDate: z.string().min(1, 'Fecha es requerida'),
  quantityKg: z.coerce.number().positive('Cantidad debe ser positiva'),
  notes: z.string().optional(),
});

/** Correcting an auto-generated figure before approving it. */
export const feedConsumptionAdjustSchema = z.object({
  adjustedQuantityKg: z.coerce.number().nonnegative('Cantidad no puede ser negativa'),
});

export const measurementUnitSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  abbreviation: z.string().min(1, 'Abreviatura es requerida').max(10),
});

export const productCategorySchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  slug: z.string().min(1, 'Identificador es requerido').max(50),
});

export type ClientInput = z.infer<typeof clientSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;
export type FeedFormulaInput = z.infer<typeof feedFormulaSchema>;
export type FeedConsumptionInput = z.infer<typeof feedConsumptionSchema>;
export type FeedConsumptionAdjustInput = z.infer<typeof feedConsumptionAdjustSchema>;
export type ProductEntryInput = z.infer<typeof productEntrySchema>;
export type ProcessingInput = z.infer<typeof processingSchema>;
/**
 * What a caller sends, as opposed to what the API holds after parsing.
 * `z.infer` is the *output* type, so a field with `.default()` is required in
 * it — and the caller is precisely who may omit it.
 */
export type ProcessingPayload = z.input<typeof processingSchema>;
export type ProductConsumptionInput = z.infer<typeof productConsumptionSchema>;
export type FeedPhaseConfigInput = z.infer<typeof feedPhaseConfigSchema>;
export type MeasurementUnitInput = z.infer<typeof measurementUnitSchema>;
export type ProductCategoryInput = z.infer<typeof productCategorySchema>;
