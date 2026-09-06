export interface User {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface Company {
  id: string;
  ownerId: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  roleId: string | null;
  isOwner: boolean;
  createdAt: string;
  user?: User;
  role?: Role;
}

export interface Role {
  id: string;
  companyId: string;
  name: string;
  permissions: Permissions;
  createdAt: string;
}

export interface ModulePermission {
  view: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
}

export interface Permissions {
  batches: ModulePermission;
  daily_logs: ModulePermission;
  sales: ModulePermission;
  transactions: ModulePermission;
  entries: ModulePermission;
  processing: ModulePermission;
  clients: ModulePermission;
  products: ModulePermission;
  warehouses: ModulePermission;
  reports: { view: boolean };
  settings: { view: boolean; edit: boolean };
  users: ModulePermission;
  [key: string]: ModulePermission | { view: boolean } | { view: boolean; edit: boolean };
}

export type BatchStatus = 'planned' | 'breeding' | 'for_sale' | 'finished';

export interface Batch {
  id: string;
  companyId: string;
  code: string | null;
  warehouseId: string;
  breed: string;
  startDate: string;
  endDate: string | null;
  initialQuantity: number;
  currentQuantity: number;
  purchasePricePerUnit: number | null;
  status: BatchStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  warehouse?: Warehouse;
  entryLines?: BatchEntryLine[];
  processings?: Processing[];
}

export interface DailyLog {
  id: string;
  batchId: string;
  companyId: string;
  logDate: string;
  waterConsumedL: number | null;
  mortality: number;
  averageWeightG: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  medicineAdministered: boolean;
  medicineNotes: string | null;
  medicineProductId: string | null;
  medicineQuantity: number | null;
  feedConsumedKg: number | null;
  feedProductId: string | null;
  healthScore: number | null;
  notes: string | null;
  createdAt: string;
  batch?: Batch;
  medicineProduct?: Product;
  feedProduct?: Product;
}

export interface Client {
  id: string;
  companyId: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Configurable per-company
export interface MeasurementUnit {
  id: string;
  companyId: string;
  name: string;
  abbreviation: string;
  createdAt: string;
}

export interface ProductCategoryConfig {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export type ProductType = 'consumable' | 'equipment';

export interface Product {
  id: string;
  companyId: string;
  code: string | null;
  name: string;
  categoryId: string;
  productType: ProductType;
  unitId: string;
  currentStock: number;
  minStock: number;
  createdAt: string;
  updatedAt: string;
  category?: ProductCategoryConfig;
  measurementUnit?: MeasurementUnit;
  lowStock?: boolean;
}

export type TransactionType = 'income' | 'expense';
export type TransactionCategory = 'feed' | 'vaccine' | 'sale_live' | 'sale_dead' | 'processing' | 'utility' | 'labor' | 'transport' | 'other' | 'capital_in' | 'owner_draw';

export interface Transaction {
  id: string;
  batchId: string | null;
  companyId: string;
  code: string | null;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  amountBs: number | null;
  exchangeRate: number | null;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  transactionDate: string;
  createdAt: string;
  batch?: Batch;
}

export type SaleType = 'live' | 'dead';
export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface Sale {
  id: string;
  batchId: string;
  companyId: string;
  code: string | null;
  clientId: string | null;
  saleType: SaleType;
  quantity: number;
  weightKg: number | null;
  pricePerKg: number | null;
  pricePerUnit: number | null;
  totalAmount: number;
  pricePerKgBs: number | null;
  totalAmountBs: number | null;
  exchangeRate: number | null;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  dueDate: string | null;
  saleDate: string;
  notes: string | null;
  createdAt: string;
  batch?: Batch;
  client?: Client;
  payments?: SalePayment[];
}

export interface SalePayment {
  id: string;
  saleId: string;
  companyId: string;
  amount: number;
  amountBs: number | null;
  exchangeRate: number | null;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  companyId: string;
  code: string | null;
  name: string;
  capacity: number | null;
  location: string | null;
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FeedPhase = 'inicio' | 'engorde';

export interface FeedFormula {
  id: string;
  companyId: string;
  breed: string;
  weekNumber: number;
  dailyFeedPerBirdG: number;
  feedPhase: FeedPhase | null;
  notes: string | null;
  createdAt: string;
}

export type ConsumptionStatus = 'pending' | 'confirmed' | 'adjusted';

export interface FeedConsumption {
  id: string;
  batchId: string;
  companyId: string;
  productId: string | null;
  consumptionDate: string;
  quantityKg: number;
  adjustedQuantityKg: number | null;
  isAutoCalculated: boolean;
  isAutoGenerated: boolean;
  status: ConsumptionStatus;
  notes: string | null;
  createdAt: string;
  batch?: Batch;
  product?: Product;
}

export type EntryStatus = 'pending' | 'received';

export interface ProductEntry {
  id: string;
  companyId: string;
  code: string | null;
  productId: string;
  batchId: string | null;
  quantity: number;
  costPerUnit: number | null;
  totalCost: number | null;
  deliveryCost: number | null;
  /** Whether the goods arrived. Says nothing about whether they were paid for. */
  status: EntryStatus;
  entryDate: string;
  supplierName: string | null;
  /** Whether it was paid. Independent of `status` — buying on credit and paying
   *  in advance are both normal, and conflating them hides what you still owe. */
  paymentStatus: PaymentStatus;
  paidAmount: number;
  notes: string | null;
  createdAt: string;
  product?: Product;
  batch?: Batch;
}

export interface BatchEntryLine {
  id: string;
  batchId: string;
  productId: string;
  quantity: number;
  costPerUnit: number | null;
  deliveryCost: number | null;
  notes: string | null;
  processed: boolean;
  createdAt: string;
  product?: Product;
}

export interface Processing {
  id: string;
  companyId: string;
  code: string | null;
  batchId: string;
  quantity: number;
  liveWeightKg: number | null;
  processedWeightKg: number | null;
  weightAdjustmentG: number;
  isSelfProcessed: boolean;
  costPerBird: number | null;
  costPerKg: number | null;
  /** ⚠️ In dollars — unlike a purchase, whose totalCost is in bolivares. */
  totalCost: number;
  /** In bolivares. This is the figure a payment settles. */
  totalCostBs: number | null;
  exchangeRate: number | null;
  /** Who did the slaughtering. Empty when it was done in-house. */
  supplierName: string | null;
  paymentStatus: PaymentStatus;
  /** In bolivares, matching totalCostBs. */
  paidAmount: number;
  productId: string | null;
  processingDate: string;
  notes: string | null;
  createdAt: string;
  batch?: Batch;
  product?: Product;
}

export interface ProductConsumption {
  id: string;
  companyId: string;
  batchId: string;
  productId: string;
  consumptionDate: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
  batch?: Batch;
  product?: Product;
}

export interface FeedPhaseConfig {
  id: string;
  companyId: string;
  breed: string;
  engordeStartWeek: number;
  createdAt: string;
  updatedAt: string;
}

// Dashboard types
export interface DashboardStats {
  activeBatches: number;
  totalAlive: number;
  mortalityPct: number;
  totalRevenue: number;
}

export interface BatchStatusDistribution {
  status: BatchStatus;
  count: number;
}

// Report types
export interface FcrDataPoint {
  date: string;
  fcr: number;
}

/** What `/reports/fcr-trend` returns: one series per batch, not loose points. */
export interface FcrSeries {
  batchId: string;
  breed: string;
  data: FcrDataPoint[];
}

export interface MortalityByBatch {
  batchName: string;
  mortality: number;
  rate: number;
}

export interface RevenueExpenseDataPoint {
  month: string;
  income: number;
  expense: number;
}

export interface GrowthCurveDataPoint {
  day: number;
  actualWeight: number;
  standardWeight: number;
}

/** What `/reports/growth-curve` returns: the curve wrapped with its batch. */
export interface GrowthCurve {
  batchId: string;
  breed: string;
  startDate: string;
  data: GrowthCurveDataPoint[];
}

export interface BatchProfitability {
  batchId: string;
  code: string | null;
  breed: string;
  startDate: string;
  status: BatchStatus;
  initialQuantity: number;
  currentQuantity: number;
  inCorral: number;
  processedCount: number;
  soldLiveCount: number;
  soldDeadCount: number;
  soldCount: number;
  mortality: number;
  mortalityPct: number;
  totalExpenses: number;
  costPerChicken: number;
  expenseBreakdown: { category: string; amount: number }[];
  totalRevenueUsd: number;
  totalRevenueBs: number;
  avgPricePerKg: number;
  avgWeightKg: number;
  avgRevenuePerChickenUsd: number;
  avgRevenuePerChickenBs: number;
  profitPerChickenBs: number;
  marginPct: number;
  projectedRevenueBs: number;
  projectedProfitBs: number;
  exchangeRate: number;
}

export interface BatchStats {
  id: string;
  breed: string;
  startDate: string;
  initialQty: number;
  mortalityRate: number;
  totalRevenue: number;
  lastWeight: number;
  status: BatchStatus;
}

// Exchange Rate types
export type RateSource = 'bcv' | 'parallel' | 'custom';

export interface ExchangeRateConfig {
  id: string;
  companyId: string;
  rateSource: RateSource;
  customRate: number | null;
  autoFetch: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  id: string;
  rateDate: string;
  bcvRate: number;
  parallelRate: number | null;
  fetchedAt: string | null;
  createdAt: string;
}

export interface CurrentExchangeRate {
  bcvRate: number;
  parallelRate: number | null;
  effectiveRate: number;
  source: RateSource;
  rateDate: string;
}

// WhatsApp types
export interface WhatsappSession {
  id: string;
  phoneNumber: string;
  userId: string | null;
  companyId: string | null;
  conversationState: string;
  isLinked: boolean;
  createdAt: string;
  updatedAt: string;
}
