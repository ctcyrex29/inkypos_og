/**
 * InkyPOS 2.0 — Sync Engine & Outbox State Machine Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNextRetryDelay,
  determineNextOutboxState,
  INITIAL_RETRY_INTERVAL_MS,
  MAX_AUTO_RETRIES,
  MAX_RETRY_INTERVAL_MS,
} from './sync.ts';
import { OutboxItem } from './types.ts';

const mockOutboxItem: OutboxItem = {
  id: 'outbox-item-1',
  syncEvent: {
    eventId: 'evt-01',
    eventType: 'SALE_CREATED',
    eventVersion: 1,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    registerId: 'reg-01',
    idempotencyKey: 'idemp-key-01',
    payload: {},
    occurredAt: new Date().toISOString(),
  },
  status: 'PENDING',
  retryCount: 0,
  nextRetryAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

test('calculateNextRetryDelay: calculates exponential backoff bounded by max interval', () => {
  const delay0 = calculateNextRetryDelay(0);
  const delay1 = calculateNextRetryDelay(1);
  const delay2 = calculateNextRetryDelay(2);
  const delayHigh = calculateNextRetryDelay(10);

  // Expect exponential progression around 2000, 4000, 8000
  assert.ok(delay0 >= 1800 && delay0 <= 2200);
  assert.ok(delay1 >= 3600 && delay1 <= 4400);
  assert.ok(delay2 >= 7200 && delay2 <= 8800);
  // Capped at MAX_RETRY_INTERVAL_MS (60s)
  assert.ok(delayHigh <= MAX_RETRY_INTERVAL_MS * 1.15);
});

test('determineNextOutboxState: moves to ACKNOWLEDGED on success or duplicate ACK', () => {
  const nextOnSuccess = determineNextOutboxState(mockOutboxItem, { success: true });
  assert.equal(nextOnSuccess.status, 'ACKNOWLEDGED');

  const nextOnDuplicate = determineNextOutboxState(mockOutboxItem, {
    success: false,
    isDuplicate: true,
  });
  assert.equal(nextOnDuplicate.status, 'ACKNOWLEDGED');
});

test('determineNextOutboxState: moves to CONFLICT when conflict record provided', () => {
  const next = determineNextOutboxState(mockOutboxItem, {
    success: false,
    conflict: {
      conflictId: 'conf-1',
      reason: 'DEVICE_REVOKED',
      serverState: {},
      clientState: {},
      resolutionStrategy: 'MANUAL_MANAGER_REVIEW',
    },
  });

  assert.equal(next.status, 'CONFLICT');
  assert.ok(next.conflictDetails);
  assert.equal(next.conflictDetails.reason, 'DEVICE_REVOKED');
});

test('determineNextOutboxState: retries on network error with incremented count', () => {
  const next = determineNextOutboxState(mockOutboxItem, {
    success: false,
    networkError: true,
    errorMessage: 'Connection refused',
  });

  assert.equal(next.status, 'PENDING');
  assert.equal(next.retryCount, 1);
  assert.equal(next.errorMessage, 'Connection refused');
});

test('determineNextOutboxState: moves to REVIEW_NEEDED when max retries exceeded', () => {
  const exhaustedItem: OutboxItem = {
    ...mockOutboxItem,
    retryCount: MAX_AUTO_RETRIES - 1,
  };

  const next = determineNextOutboxState(exhaustedItem, {
    success: false,
    networkError: true,
  });

  assert.equal(next.status, 'REVIEW_NEEDED');
  assert.equal(next.retryCount, MAX_AUTO_RETRIES);
});
