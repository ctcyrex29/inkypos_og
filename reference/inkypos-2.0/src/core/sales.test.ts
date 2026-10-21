/**
 * InkyPOS 2.0 — Sales & Transaction Assembly Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSaleTransaction, generateReceiptNumber, generateUUID } from './sales.ts';
import { PaymentRecord, Product } from './types.ts';

const mockProduct: Product = {
  id: 'prod-test-01',
  tenantId: 'tenant-test',
  name: 'Test Product',
  barcode: '123456789012',
  sku: 'TEST-01',
  category: 'Test',
  priceUSD: 10.00,
  taxCategoryId: 'tax-vat-std',
  stockQuantity: 50,
  allowNegativeStock: false,
  active: true,
};

test('generateUUID: produces standard format UUID v4 strings', () => {
  const uuid1 = generateUUID();
  const uuid2 = generateUUID();
  assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(uuid1, uuid2);
});

test('generateReceiptNumber: produces standard POS receipt number format', () => {
  const num = generateReceiptNumber('TILL-01', 5);
  assert.match(num, /^REC-TILL-01-\d{8}-0005$/);
});

test('buildSaleTransaction: successfully packages sale, generates event, and builds outbox item', () => {
  const payments: PaymentRecord[] = [
    {
      id: 'pay-1',
      paymentMethod: 'CASH_USD',
      currency: 'USD',
      amount: 25.00,
      amountInUSD: 25.00,
      exchangeRate: 25.4,
      status: 'SETTLED_OFFLINE',
      tenderedAt: new Date().toISOString(),
    },
  ];

  const result = buildSaleTransaction({
    tenantId: 'tenant-test',
    branchId: 'branch-test',
    registerId: 'reg-01',
    registerCode: 'R01',
    sequenceNumber: 12,
    cashierId: 'cashier-01',
    cashierName: 'John Cashier',
    items: [{ product: mockProduct, quantity: 2, discountUSD: 0 }],
    payments,
    primaryCurrency: 'USD',
    exchangeRate: 25.4,
  });

  // Verify sale structure
  assert.equal(result.sale.totalUSD, 20.00);
  assert.equal(result.sale.subtotalUSD, 20.00);
  assert.equal(result.sale.changeDueUSD, 5.00);
  assert.equal(result.sale.changeDueZIG, 127.00); // 5.00 * 25.4
  assert.equal(result.sale.status, 'COMPLETED');
  assert.equal(result.sale.localReceiptNumber, generateReceiptNumber('R01', 12));

  // Verify sync event contract
  assert.equal(result.syncEvent.eventType, 'SALE_CREATED');
  assert.equal(result.syncEvent.eventVersion, 1);
  assert.equal(result.syncEvent.tenantId, 'tenant-test');
  assert.equal(result.syncEvent.registerId, 'reg-01');
  assert.equal(result.syncEvent.idempotencyKey, `sale:tenant-test:reg-01:${result.sale.id}`);
  assert.deepEqual(result.syncEvent.payload, result.sale);

  // Verify durable outbox item
  assert.equal(result.outboxItem.status, 'PENDING');
  assert.equal(result.outboxItem.retryCount, 0);
  assert.deepEqual(result.outboxItem.syncEvent, result.syncEvent);
});

test('buildSaleTransaction: throws error if cart is empty', () => {
  assert.throws(
    () => {
      buildSaleTransaction({
        tenantId: 't1',
        branchId: 'b1',
        registerId: 'r1',
        registerCode: 'R1',
        sequenceNumber: 1,
        cashierId: 'c1',
        cashierName: 'Cashier',
        items: [],
        payments: [],
        primaryCurrency: 'USD',
        exchangeRate: 25.4,
      });
    },
    { message: /Cart is empty/ }
  );
});

test('buildSaleTransaction: throws error if payment is insufficient', () => {
  const underPayments: PaymentRecord[] = [
    {
      id: 'pay-1',
      paymentMethod: 'CASH_USD',
      currency: 'USD',
      amount: 5.00,
      amountInUSD: 5.00,
      exchangeRate: 25.4,
      status: 'SETTLED_OFFLINE',
      tenderedAt: new Date().toISOString(),
    },
  ];

  assert.throws(
    () => {
      buildSaleTransaction({
        tenantId: 't1',
        branchId: 'b1',
        registerId: 'r1',
        registerCode: 'R1',
        sequenceNumber: 1,
        cashierId: 'c1',
        cashierName: 'Cashier',
        items: [{ product: mockProduct, quantity: 1 }],
        payments: underPayments,
        primaryCurrency: 'USD',
        exchangeRate: 25.4,
      });
    },
    { message: /Insufficient payment/ }
  );
});
