/**
 * InkyPOS 2.0 — Subscription & Offline Grace Period Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { canRegisterNewDevice, evaluateOfflineGraceStatus, getTierEntitlements } from './subscription.ts';
import { Tenant } from './types.ts';

test('getTierEntitlements: returns configured limits for each tier', () => {
  const starter = getTierEntitlements('starter');
  assert.equal(starter.maxBranches, 1);
  assert.equal(starter.maxRegisters, 2);
  assert.equal(starter.offlineGraceDays, 7);

  const growth = getTierEntitlements('growth');
  assert.equal(growth.maxBranches, 5);
  assert.equal(growth.maxRegisters, 10);
  assert.equal(growth.offlineGraceDays, 14);

  const ent = getTierEntitlements('enterprise');
  assert.equal(ent.maxBranches, 50);
  assert.equal(ent.maxRegisters, 100);
  assert.equal(ent.offlineGraceDays, 30);
});

test('evaluateOfflineGraceStatus: healthy when well within grace window', () => {
  const baseTime = new Date('2026-10-20T12:00:00Z');
  const tenant: Tenant = {
    id: 't1',
    name: 'Test Tenant',
    slug: 'test',
    tin: '123',
    currency: 'USD',
    subscriptionTier: 'growth', // 14 days grace
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2027-01-01T00:00:00Z',
    lastServerSyncAt: '2026-10-18T12:00:00Z', // 2 days ago
    createdAt: '2026-01-01T00:00:00Z',
  };

  const status = evaluateOfflineGraceStatus(tenant, baseTime);
  assert.equal(status.isWithinGrace, true);
  assert.equal(status.status, 'HEALTHY');
  assert.equal(status.daysRemaining, 12);
});

test('evaluateOfflineGraceStatus: warning when less than 48 hours remaining', () => {
  const syncTime = new Date('2026-10-01T00:00:00Z');
  // Starter has 7 days grace -> expires Oct 8 00:00:00Z
  // Current time: Oct 7 12:00:00Z -> 12 hours remaining
  const currentTime = new Date('2026-10-07T12:00:00Z');

  const tenant: Tenant = {
    id: 't1',
    name: 'Test Tenant',
    slug: 'test',
    tin: '123',
    currency: 'USD',
    subscriptionTier: 'starter',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2027-01-01T00:00:00Z',
    lastServerSyncAt: syncTime.toISOString(),
    createdAt: '2026-01-01T00:00:00Z',
  };

  const status = evaluateOfflineGraceStatus(tenant, currentTime);
  assert.equal(status.isWithinGrace, true);
  assert.equal(status.status, 'WARNING');
  assert.ok(status.hoursRemaining <= 48);
});

test('evaluateOfflineGraceStatus: locked when grace period has expired', () => {
  const syncTime = new Date('2026-10-01T00:00:00Z');
  // Starter has 7 days grace -> expired on Oct 8
  // Current time: Oct 15
  const currentTime = new Date('2026-10-15T00:00:00Z');

  const tenant: Tenant = {
    id: 't1',
    name: 'Test Tenant',
    slug: 'test',
    tin: '123',
    currency: 'USD',
    subscriptionTier: 'starter',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2027-01-01T00:00:00Z',
    lastServerSyncAt: syncTime.toISOString(),
    createdAt: '2026-01-01T00:00:00Z',
  };

  const status = evaluateOfflineGraceStatus(tenant, currentTime);
  assert.equal(status.isWithinGrace, false);
  assert.equal(status.status, 'LOCKED');
  assert.equal(status.daysRemaining, 0);
});

test('canRegisterNewDevice: enforces tier register ceilings', () => {
  const starterAllowed = canRegisterNewDevice(1, 'starter');
  assert.equal(starterAllowed.allowed, true);

  const starterBlocked = canRegisterNewDevice(2, 'starter');
  assert.equal(starterBlocked.allowed, false);
  assert.match(starterBlocked.message!, /Plan limit reached/);

  const growthAllowed = canRegisterNewDevice(2, 'growth');
  assert.equal(growthAllowed.allowed, true);
});
