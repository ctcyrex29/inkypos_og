/**
 * InkyPOS 2.0 — Laravel Central API Contracts (v1)
 * Standardized request and response payloads for multi-tenant synchronization.
 */

import {
  Branch,
  ConflictRecord,
  CurrencyCode,
  Product,
  Register,
  SaleTransaction,
  SubscriptionEntitlements,
  SyncEvent,
  Tenant,
  User,
} from '../core/types.ts';

// Common API Response Envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    serverVersion: string;
  };
}

// Device Registration Request & Response
export interface DeviceRegisterRequest {
  tenantSlug: string;
  enrollmentKey: string;
  deviceFingerprint: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web';
  appVersion: string;
  branchId: string;
}

export interface DeviceRegisterResponse {
  deviceToken: string;
  register: Register;
  tenant: Tenant;
  branch: Branch;
  entitlements: SubscriptionEntitlements;
  assignedCashier?: User;
}

// Catalogue Snapshot Request & Response
export interface CatalogueSnapshotResponse {
  tenantId: string;
  snapshotVersion: number;
  products: Product[];
  exchangeRateUSDToZIG: number;
  primaryCurrency: CurrencyCode;
  taxCategories: Array<{
    id: string;
    name: string;
    rate: number;
    isExempt: boolean;
  }>;
  syncedAt: string;
}

// Central Event Synchronization Batch
export interface SyncBatchRequest {
  registerId: string;
  deviceToken: string;
  clientTimestamp: string;
  events: SyncEvent[];
}

export interface EventAck {
  eventId: string;
  idempotencyKey: string;
  status: 'PROCESSED' | 'DUPLICATE_ACK' | 'CONFLICT' | 'REJECTED';
  centralSaleId?: string;
  conflict?: ConflictRecord;
  message?: string;
}

export interface SyncBatchResponse {
  processedCount: number;
  duplicateCount: number;
  conflictCount: number;
  acknowledgements: EventAck[];
  serverTimestamp: string;
}

// Reconciliation Report Request & Response
export interface ReconciliationReportResponse {
  tenantId: string;
  branchId: string;
  totalSalesCount: number;
  totalVolumeUSD: number;
  totalVolumeZIG: number;
  breakdownByPaymentMethod: Record<string, { count: number; totalUSD: number }>;
  unsyncedEventsCount: number;
  discrepancies: Array<{
    saleId: string;
    receiptNumber: string;
    type: 'MISSING_ON_SERVER' | 'AMOUNT_MISMATCH' | 'STATUS_MISMATCH';
    description: string;
  }>;
}
