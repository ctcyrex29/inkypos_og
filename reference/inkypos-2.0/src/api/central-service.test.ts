/**
 * InkyPOS 2.0 — Central API & Idempotency Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CentralLaravelService } from './central-service.ts';
import { SaleTransaction, SyncEvent } from '../core/types.ts';

test('CentralLaravelService: enforces idempotency on repeated event submissions', async () => {
  const central = new CentralLaravelService();

  const salePayload: SaleTransaction = {
    id: 'sale-idem-01',
    localReceiptNumber: 'REC-001',
    tenantId: 'tenant-harare-01',
    branchId: 'branch-harare-cbd',
    registerId: 'reg-harare-01',
    cashierId: 'cashier-01',
    cashierName: 'Tinashe',
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

  const syncEvent: SyncEvent<SaleTransaction> = {
    eventId: 'evt-idem-01',
    eventType: 'SALE_CREATED',
    eventVersion: 1,
    tenantId: 'tenant-harare-01',
    branchId: 'branch-harare-cbd',
    registerId: 'reg-harare-01',
    idempotencyKey: 'sale:tenant-harare-01:reg-harare-01:sale-idem-01',
    payload: salePayload,
    occurredAt: new Date().toISOString(),
  };

  // 1. Initial submission
  const res1 = await central.syncBatch({
    registerId: 'reg-harare-01',
    deviceToken: 'token-1',
    clientTimestamp: new Date().toISOString(),
    events: [syncEvent],
  });

  assert.equal(res1.processedCount, 1);
  assert.equal(res1.duplicateCount, 0);
  assert.equal(res1.acknowledgements[0].status, 'PROCESSED');

  const centralSalesInitial = central.getCentralSales('tenant-harare-01');
  assert.equal(centralSalesInitial.length, 1);

  // 2. Resubmission (e.g. client lost ACK due to network timeout right after server committed)
  const res2 = await central.syncBatch({
    registerId: 'reg-harare-01',
    deviceToken: 'token-1',
    clientTimestamp: new Date().toISOString(),
    events: [syncEvent],
  });

  assert.equal(res2.processedCount, 0);
  assert.equal(res2.duplicateCount, 1);
  assert.equal(res2.acknowledgements[0].status, 'DUPLICATE_ACK');

  // Verify central sales count did NOT duplicate!
  const centralSalesAfter = central.getCentralSales('tenant-harare-01');
  assert.equal(centralSalesAfter.length, 1);
});

test('CentralLaravelService: rejects cross-tenant sale injection with conflict', async () => {
  const central = new CentralLaravelService();

  // Register belongs to tenant-harare-01, but sale claims tenant-bulawayo-02
  const fakeSale: SaleTransaction = {
    id: 'sale-cross-tenant',
    localReceiptNumber: 'REC-999',
    tenantId: 'tenant-bulawayo-02', // Mismatch!
    branchId: 'branch-harare-cbd',
    registerId: 'reg-harare-01',
    cashierId: 'c1',
    cashierName: 'Imposter',
    subtotalUSD: 50,
    discountUSD: 0,
    taxTotalUSD: 7.5,
    totalUSD: 50,
    currency: 'USD',
    totalInDisplayCurrency: 50,
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

  const syncEvent: SyncEvent = {
    eventId: 'evt-cross-01',
    eventType: 'SALE_CREATED',
    eventVersion: 1,
    tenantId: 'tenant-bulawayo-02',
    branchId: 'branch-harare-cbd',
    registerId: 'reg-harare-01',
    idempotencyKey: 'fake-key-99',
    payload: fakeSale,
    occurredAt: new Date().toISOString(),
  };

  const res = await central.syncBatch({
    registerId: 'reg-harare-01',
    deviceToken: 'token-1',
    clientTimestamp: new Date().toISOString(),
    events: [syncEvent],
  });

  assert.equal(res.conflictCount, 1);
  assert.equal(res.acknowledgements[0].status, 'CONFLICT');
});

test('CentralLaravelService: rejects revoked device events', async () => {
  const central = new CentralLaravelService();
  await central.revokeDevice('reg-harare-01');

  const syncEvent: SyncEvent = {
    eventId: 'evt-revoked-01',
    eventType: 'SALE_CREATED',
    eventVersion: 1,
    tenantId: 'tenant-harare-01',
    branchId: 'branch-harare-cbd',
    registerId: 'reg-harare-01',
    idempotencyKey: 'revoked-key-01',
    payload: {},
    occurredAt: new Date().toISOString(),
  };

  const res = await central.syncBatch({
    registerId: 'reg-harare-01',
    deviceToken: 'token-1',
    clientTimestamp: new Date().toISOString(),
    events: [syncEvent],
  });

  assert.equal(res.conflictCount, 1);
  assert.equal(res.acknowledgements[0].status, 'CONFLICT');
  assert.equal(res.acknowledgements[0].conflict?.reason, 'DEVICE_REVOKED');
});
