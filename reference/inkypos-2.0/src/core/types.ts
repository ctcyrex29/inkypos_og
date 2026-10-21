/**
 * InkyPOS 2.0 — Core Domain Types
 * InkGenius Technologies
 */

export type CurrencyCode = 'USD' | 'ZIG';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  decimals: number;
  exchangeRateToUSD: number; // 1 USD = X ZIG (e.g. 25.4)
}

export type UserRole = 'super_admin' | 'tenant_admin' | 'branch_manager' | 'cashier';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  pinCode?: string; // 4-digit fast terminal login
  active: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tin: string; // Taxpayer Identification Number
  vatNumber?: string;
  currency: CurrencyCode;
  subscriptionTier: 'starter' | 'growth' | 'enterprise';
  subscriptionStatus: 'active' | 'past_due' | 'grace_period' | 'cancelled';
  subscriptionExpiresAt: string; // ISO
  lastServerSyncAt?: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address: string;
  city: string;
  active: boolean;
}

export interface Register {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  deviceFingerprint: string;
  platform: 'android' | 'ios' | 'web';
  status: 'authorized' | 'revoked' | 'pending';
  lastSeenAt: string;
}

export interface SubscriptionEntitlements {
  tier: 'starter' | 'growth' | 'enterprise';
  maxBranches: number;
  maxRegisters: number;
  multiCurrency: boolean;
  offlineGraceDays: number;
  fiscalisationEnabled: boolean;
  apiAccess: boolean;
}

export interface TaxCategory {
  id: string;
  name: string;
  rate: number; // e.g. 0.15 for 15% standard VAT
  isExempt: boolean;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  barcode: string;
  sku: string;
  category: string;
  priceUSD: number; // Stored as decimal (e.g. 12.50)
  taxCategoryId: string;
  costPriceUSD?: number;
  stockQuantity: number;
  allowNegativeStock: boolean;
  imageUrl?: string;
  active: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPriceUSD: number;
  discountUSD: number;
  taxAmountUSD: number;
  totalUSD: number;
}

export type PaymentMethod = 'CASH_USD' | 'CASH_ZIG' | 'ECOCASH' | 'INNBUCKS' | 'CARD_USD' | 'CARD_ZIG' | 'SWIPE';

export interface PaymentRecord {
  id: string;
  paymentMethod: PaymentMethod;
  currency: CurrencyCode;
  amount: number; // In tendered currency
  amountInUSD: number; // Normalized to base USD
  exchangeRate: number;
  reference?: string;
  status: 'SETTLED_OFFLINE' | 'SETTLED_ONLINE' | 'FAILED' | 'PENDING';
  tenderedAt: string;
}

export interface TaxBreakdown {
  taxCategoryId: string;
  taxCategoryName: string;
  rate: number;
  taxableAmountUSD: number;
  taxAmountUSD: number;
}

export type FiscalStatus = 
  | 'NOT_REQUIRED'
  | 'PENDING_VERIFICATION'
  | 'SUBMITTED_STAGING'
  | 'FISCALISED'
  | 'FAILED_RETRY';

export interface SaleTransaction {
  id: string; // UUID v4 assigned at register
  localReceiptNumber: string; // e.g. "R01-20261020-0014"
  tenantId: string;
  branchId: string;
  registerId: string;
  cashierId: string;
  cashierName: string;
  subtotalUSD: number;
  discountUSD: number;
  taxTotalUSD: number;
  totalUSD: number;
  currency: CurrencyCode; // Primary currency displayed on receipt
  totalInDisplayCurrency: number;
  exchangeRateUsed: number;
  items: CartItem[];
  payments: PaymentRecord[];
  taxes: TaxBreakdown[];
  changeDueUSD: number;
  changeDueZIG: number;
  fiscalStatus: FiscalStatus;
  fiscalSignature?: string;
  fiscalVerificationUrl?: string;
  createdAt: string; // ISO timestamp
  status: 'COMPLETED' | 'REFUNDED' | 'VOIDED';
}

// Durable Synchronization Outbox Types
export type OutboxStatus = 'PENDING' | 'SYNCING' | 'ACKNOWLEDGED' | 'CONFLICT' | 'REVIEW_NEEDED';

export type EventType = 
  | 'SALE_CREATED'
  | 'PAYMENT_RECORDED'
  | 'STOCK_ADJUSTED'
  | 'REGISTER_OPENED'
  | 'REGISTER_CLOSED'
  | 'DEVICE_HEARTBEAT';

export interface SyncEvent<T = unknown> {
  eventId: string; // UUID v4
  eventType: EventType;
  eventVersion: number; // e.g. 1
  tenantId: string;
  branchId: string;
  registerId: string;
  idempotencyKey: string; // SHA256 or UUID
  payload: T;
  occurredAt: string; // ISO timestamp
}

export interface OutboxItem {
  id: string; // UUID
  syncEvent: SyncEvent;
  status: OutboxStatus;
  retryCount: number;
  nextRetryAt: string; // ISO
  lastAttemptAt?: string;
  errorMessage?: string;
  conflictDetails?: ConflictRecord;
  createdAt: string;
}

export interface ConflictRecord {
  conflictId: string;
  reason: 'PRICE_MISMATCH' | 'STOCK_OVERDRAW' | 'SUBSCRIPTION_LOCKED' | 'DEVICE_REVOKED' | 'DUPLICATE_RECEIPT';
  serverState: unknown;
  clientState: unknown;
  resolutionStrategy: 'SERVER_AUTHORITY' | 'CLIENT_AUTHORITY' | 'MANUAL_MANAGER_REVIEW';
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface OfflineGraceStatus {
  isWithinGrace: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  graceExpiresAt: string;
  status: 'HEALTHY' | 'WARNING' | 'LOCKED';
  reason?: string;
}
