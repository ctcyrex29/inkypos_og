/**
 * InkyPOS 2.0 — Storage Adapter Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from './memory.ts';
import { OutboxItem, Product, SaleTransaction } from '../core/types.ts';

test('MemoryStorageAdapter: persists, retrieves, and filters sales and outbox items', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.init();

  const mockProduct: Product = {
    id: 'prod-01',
    tenantId: 'tenant-1',
    name: 'Sugar 2kg',
    barcode: '60010001',
    sku: 'SUG-01',
    category: 'Groceries',
    priceUSD: 2.40,
    taxCategoryId: 'tax-vat-std',
    stockQuantity: 100,
    allowNegativeStock: false,
    active: true,
  };

  await storage.saveProducts([mockProduct]);
  const prods = await storage.getProducts();
  assert.equal(prods.length, 1);
  assert.equal(prods[0].name, 'Sugar 2kg');

  // Adjust stock
  await storage.adjustProductStock('prod-01', -5);
  const updatedProd = await storage.getProductById('prod-01');
  assert.equal(updatedProd?.stockQuantity, 95);

  // Save Sale
  const mockSale: SaleTransaction = {
    id: 'sale-001',
    localReceiptNumber: 'REC-001',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    registerId: 'reg-01',
    cashierId: 'c1',
    cashierName: 'Jane',
    subtotalUSD: 10,
    discountUSD: 0,
    taxTotalUSD: 1.5,
    totalUSD: 10,
    currency: 'USD',
    totalInDisplayCurrency: 10,
    exchangeRateUsed: 25.4,
    items: [],
    payments: [],
    taxes: [],
    changeDueUSD: 0,
    changeDueZIG: 0,
    fiscalStatus: 'PENDING_VERIFICATION',
    createdAt: new Date().toISOString(),
    status: 'COMPLETED',
  };

  await storage.saveSale(mockSale);
  const sales = await storage.getSales();
  assert.equal(sales.length, 1);
  assert.equal(sales[0].id, 'sale-001');

  // Outbox Item
  const mockOutbox: OutboxItem = {
    id: 'out-01',
    syncEvent: {
      eventId: 'evt-01',
      eventType: 'SALE_CREATED',
      eventVersion: 1,
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      registerId: 'reg-01',
      idempotencyKey: 'idemp-01',
      payload: mockSale,
      occurredAt: new Date().toISOString(),
    },
    status: 'PENDING',
    retryCount: 0,
    nextRetryAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await storage.saveOutboxItem(mockOutbox);
  const pendingOutbox = await storage.getOutboxItems('PENDING');
  assert.equal(pendingOutbox.length, 1);

  // Update outbox status to ACKNOWLEDGED
  await storage.updateOutboxItem('out-01', { status: 'ACKNOWLEDGED' });
  const acknowledgedOutbox = await storage.getOutboxItems('ACKNOWLEDGED');
  assert.equal(acknowledgedOutbox.length, 1);
  const remainingPending = await storage.getOutboxItems('PENDING');
  assert.equal(remainingPending.length, 0);

  // Device State
  await storage.saveDeviceState('active_register_id', 'reg-01');
  const regId = await storage.getDeviceState<string>('active_register_id');
  assert.equal(regId, 'reg-01');

  // Clear all
  await storage.clearAll();
  const emptyProds = await storage.getProducts();
  assert.equal(emptyProds.length, 0);
});
