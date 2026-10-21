/**
 * InkyPOS 2.0 — Subscription & Offline Grace Policies
 * Enforces multi-tenant tier entitlements and offline operation windows.
 */

import { OfflineGraceStatus, SubscriptionEntitlements, Tenant } from './types.ts';

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionEntitlements> = {
  starter: {
    tier: 'starter',
    maxBranches: 1,
    maxRegisters: 2,
    multiCurrency: true,
    offlineGraceDays: 7, // 7 days offline grace
    fiscalisationEnabled: false,
    apiAccess: false,
  },
  growth: {
    tier: 'growth',
    maxBranches: 5,
    maxRegisters: 10,
    multiCurrency: true,
    offlineGraceDays: 14, // 14 days offline grace
    fiscalisationEnabled: true,
    apiAccess: true,
  },
  enterprise: {
    tier: 'enterprise',
    maxBranches: 50,
    maxRegisters: 100,
    multiCurrency: true,
    offlineGraceDays: 30, // 30 days offline grace
    fiscalisationEnabled: true,
    apiAccess: true,
  },
};

export function getTierEntitlements(tier: 'starter' | 'growth' | 'enterprise'): SubscriptionEntitlements {
  return SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.starter;
}

export function evaluateOfflineGraceStatus(
  tenant: Tenant,
  currentDate: Date = new Date()
): OfflineGraceStatus {
  const entitlements = getTierEntitlements(tenant.subscriptionTier);
  const graceDays = entitlements.offlineGraceDays;

  // Reference timestamp: last server sync date or tenant creation date
  const referenceDateStr = tenant.lastServerSyncAt || tenant.createdAt;
  const referenceDate = new Date(referenceDateStr);

  const graceExpiresTime = referenceDate.getTime() + graceDays * 24 * 60 * 60 * 1000;
  const graceExpiresAt = new Date(graceExpiresTime).toISOString();

  const diffMs = graceExpiresTime - currentDate.getTime();
  const hoursRemaining = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const daysRemaining = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffMs <= 0) {
    return {
      isWithinGrace: false,
      daysRemaining: 0,
      hoursRemaining: 0,
      graceExpiresAt,
      status: 'LOCKED',
      reason: `Offline grace window of ${graceDays} days expired. Reconnect to central server to re-authorize terminal.`,
    };
  }

  // Warning when less than 48 hours left
  if (hoursRemaining <= 48) {
    return {
      isWithinGrace: true,
      daysRemaining,
      hoursRemaining,
      graceExpiresAt,
      status: 'WARNING',
      reason: `Terminal offline for extended period. ${hoursRemaining} hours remaining in grace window.`,
    };
  }

  return {
    isWithinGrace: true,
    daysRemaining,
    hoursRemaining,
    graceExpiresAt,
    status: 'HEALTHY',
  };
}

export function canRegisterNewDevice(
  currentRegisterCount: number,
  tier: 'starter' | 'growth' | 'enterprise'
): { allowed: boolean; maxAllowed: number; message?: string } {
  const entitlements = getTierEntitlements(tier);
  if (currentRegisterCount >= entitlements.maxRegisters) {
    return {
      allowed: false,
      maxAllowed: entitlements.maxRegisters,
      message: `Plan limit reached: ${tier} tier allows up to ${entitlements.maxRegisters} registers. Upgrade plan to add more devices.`,
    };
  }
  return {
    allowed: true,
    maxAllowed: entitlements.maxRegisters,
  };
}
