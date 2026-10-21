/**
 * InkyPOS 2.0 — Sales & Transaction Assembly
 * Encapsulates checkout business rules, atomic sale packaging,
 * and outbox synchronization event generation.
 */

import {
  CartItem,
  CurrencyCode,
  OutboxItem,
  PaymentRecord,
  Product,
  SaleTransaction,
  SyncEvent,
  TaxCategory,
} from './types.ts';
import { roundToDecimals, usdToZig } from './currency.ts';
import { computeTaxesBreakdown, DEFAULT_TAX_CATEGORIES } from './tax.ts';

// Deterministic UUID v4 generator for both Web and Native
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateReceiptNumber(registerCode: string, sequence: number): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seqPad = sequence.toString().padStart(4, '0');
  return `REC-${registerCode}-${dateStr}-${seqPad}`;
}

export interface BuildSaleParams {
  tenantId: string;
  branchId: string;
  registerId: string;
  registerCode: string;
  sequenceNumber: number;
  cashierId: string;
  cashierName: string;
  items: Array<{ product: Product; quantity: number; discountUSD?: number }>;
  payments: PaymentRecord[];
  primaryCurrency: CurrencyCode;
  exchangeRate: number;
  taxCategories?: TaxCategory[];
}

export interface BuiltSaleResult {
  sale: SaleTransaction;
  syncEvent: SyncEvent<SaleTransaction>;
  outboxItem: OutboxItem;
}

export function buildSaleTransaction(params: BuildSaleParams): BuiltSaleResult {
  const {
    tenantId,
    branchId,
    registerId,
    registerCode,
    sequenceNumber,
    cashierId,
    cashierName,
    items: rawItems,
    payments,
    primaryCurrency,
    exchangeRate,
    taxCategories = DEFAULT_TAX_CATEGORIES,
  } = params;

  if (rawItems.length === 0) {
    throw new Error('Cannot complete sale: Cart is empty');
  }

  // Calculate cart items
  const processedItems: CartItem[] = rawItems.map((item) => {
    const unitPriceUSD = item.product.priceUSD;
    const discountUSD = item.discountUSD || 0;
    const grossTotal = roundToDecimals(unitPriceUSD * item.quantity - discountUSD, 2);

    // Tax calculation
    const cat =
      taxCategories.find((c) => c.id === item.product.taxCategoryId) ||
      taxCategories[0];
    const taxAmountUSD =
      cat.isExempt || cat.rate === 0
        ? 0
        : roundToDecimals(grossTotal - grossTotal / (1 + cat.rate), 2);

    return {
      product: item.product,
      quantity: item.quantity,
      unitPriceUSD,
      discountUSD,
      taxAmountUSD,
      totalUSD: grossTotal,
    };
  });

  const subtotalUSD = roundToDecimals(
    processedItems.reduce((acc, i) => acc + i.unitPriceUSD * i.quantity, 0),
    2
  );
  const discountUSD = roundToDecimals(
    processedItems.reduce((acc, i) => acc + i.discountUSD, 0),
    2
  );
  const totalUSD = roundToDecimals(
    processedItems.reduce((acc, i) => acc + i.totalUSD, 0),
    2
  );

  const taxes = computeTaxesBreakdown(
    rawItems.map((i) => ({ ...i, discountUSD: i.discountUSD || 0 })),
    taxCategories
  );
  const taxTotalUSD = roundToDecimals(
    taxes.reduce((acc, t) => acc + t.taxAmountUSD, 0),
    2
  );

  const totalPaidUSD = roundToDecimals(
    payments.reduce((acc, p) => acc + p.amountInUSD, 0),
    2
  );

  if (totalPaidUSD < totalUSD) {
    throw new Error(
      `Insufficient payment: Tendered $${totalPaidUSD} is less than total $${totalUSD}`
    );
  }

  const changeDueUSD = roundToDecimals(totalPaidUSD - totalUSD, 2);
  const changeDueZIG = usdToZig(changeDueUSD, exchangeRate);

  const saleId = generateUUID();
  const receiptNumber = generateReceiptNumber(registerCode, sequenceNumber);
  const now = new Date().toISOString();

  const totalInDisplayCurrency =
    primaryCurrency === 'ZIG' ? usdToZig(totalUSD, exchangeRate) : totalUSD;

  const sale: SaleTransaction = {
    id: saleId,
    localReceiptNumber: receiptNumber,
    tenantId,
    branchId,
    registerId,
    cashierId,
    cashierName,
    subtotalUSD,
    discountUSD,
    taxTotalUSD,
    totalUSD,
    currency: primaryCurrency,
    totalInDisplayCurrency,
    exchangeRateUsed: exchangeRate,
    items: processedItems,
    payments,
    taxes,
    changeDueUSD,
    changeDueZIG,
    fiscalStatus: 'PENDING_VERIFICATION', // Staging verification stub
    createdAt: now,
    status: 'COMPLETED',
  };

  // Sync Event payload with deterministic idempotency key
  const eventId = generateUUID();
  const idempotencyKey = `sale:${tenantId}:${registerId}:${saleId}`;

  const syncEvent: SyncEvent<SaleTransaction> = {
    eventId,
    eventType: 'SALE_CREATED',
    eventVersion: 1,
    tenantId,
    branchId,
    registerId,
    idempotencyKey,
    payload: sale,
    occurredAt: now,
  };

  const outboxItem: OutboxItem = {
    id: generateUUID(),
    syncEvent,
    status: 'PENDING',
    retryCount: 0,
    nextRetryAt: now,
    createdAt: now,
  };

  return { sale, syncEvent, outboxItem };
}
