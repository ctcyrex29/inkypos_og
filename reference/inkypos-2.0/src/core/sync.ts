/**
 * InkyPOS 2.0 — Synchronization Engine & Conflict Policies
 * Implements exponential backoff, retry management, idempotency handling,
 * and conflict policy dispatching.
 */

import { ConflictRecord, OutboxItem, OutboxStatus } from './types.ts';

export const INITIAL_RETRY_INTERVAL_MS = 2000; // 2 seconds
export const MAX_RETRY_INTERVAL_MS = 60000; // 60 seconds
export const MAX_AUTO_RETRIES = 5;

/**
 * Calculates exponential backoff with deterministic jitter bounds
 */
export function calculateNextRetryDelay(retryCount: number): number {
  const base = Math.min(
    MAX_RETRY_INTERVAL_MS,
    INITIAL_RETRY_INTERVAL_MS * Math.pow(2, retryCount)
  );
  // Add 10% deterministic spread to avoid thundering herd
  const spread = base * 0.1;
  return Math.floor(base + (retryCount % 2 === 0 ? spread : -spread));
}

export function computeNextRetryTimestamp(retryCount: number, fromDate: Date = new Date()): string {
  const delayMs = calculateNextRetryDelay(retryCount);
  return new Date(fromDate.getTime() + delayMs).toISOString();
}

/**
 * Specific conflict resolution policy per domain
 */
export type DomainConflictType =
  | 'COMPLETED_SALE'
  | 'STOCK_MOVEMENT'
  | 'PRICE_UPDATE'
  | 'CATALOGUE_CHANGE'
  | 'PAYMENT_RECORD';

export interface ConflictPolicyRule {
  domain: DomainConflictType;
  strategy: 'SERVER_AUTHORITY' | 'CLIENT_AUTHORITY' | 'APPEND_AUDIT' | 'MANAGER_REVIEW';
  description: string;
}

export const CONFLICT_POLICIES: Record<DomainConflictType, ConflictPolicyRule> = {
  COMPLETED_SALE: {
    domain: 'COMPLETED_SALE',
    strategy: 'APPEND_AUDIT',
    description:
      'Completed sales are immutable financial records. Never discard or overwrite. In conflict, append and flag for manager review.',
  },
  STOCK_MOVEMENT: {
    domain: 'STOCK_MOVEMENT',
    strategy: 'APPEND_AUDIT',
    description:
      'Do NOT use last-write-wins. Apply stock delta adjustments ledger-style. If negative, log stock overdraw exception.',
  },
  PRICE_UPDATE: {
    domain: 'PRICE_UPDATE',
    strategy: 'SERVER_AUTHORITY',
    description:
      'Server catalogue pricing takes precedence for new sales; however, already committed offline sales honor the offline price snapshot.',
  },
  CATALOGUE_CHANGE: {
    domain: 'CATALOGUE_CHANGE',
    strategy: 'SERVER_AUTHORITY',
    description:
      'Server catalogue is authoritative. Client local catalogue updates via atomic snapshot replacement.',
  },
  PAYMENT_RECORD: {
    domain: 'PAYMENT_RECORD',
    strategy: 'MANAGER_REVIEW',
    description:
      'Mismatched payment records require managerial reconciliation. Terminal preserves proof of payment.',
  },
};

export function determineNextOutboxState(
  item: OutboxItem,
  syncOutcome: {
    success: boolean;
    acknowledged?: boolean;
    isDuplicate?: boolean;
    conflict?: ConflictRecord;
    networkError?: boolean;
    errorMessage?: string;
  }
): {
  status: OutboxStatus;
  retryCount: number;
  nextRetryAt: string;
  conflictDetails?: ConflictRecord;
  errorMessage?: string;
} {
  const now = new Date();

  // If successfully acknowledged (or server detected idempotency duplicate)
  if (syncOutcome.success || syncOutcome.acknowledged || syncOutcome.isDuplicate) {
    return {
      status: 'ACKNOWLEDGED',
      retryCount: item.retryCount,
      nextRetryAt: now.toISOString(),
      errorMessage: undefined,
    };
  }

  // Conflict encountered (e.g. revoked device, subscription lock, price violation)
  if (syncOutcome.conflict) {
    return {
      status: 'CONFLICT',
      retryCount: item.retryCount,
      nextRetryAt: now.toISOString(),
      conflictDetails: syncOutcome.conflict,
      errorMessage: syncOutcome.errorMessage || 'Synchronization conflict detected',
    };
  }

  // Network or transient error: backoff and retry
  const newRetryCount = item.retryCount + 1;
  if (newRetryCount >= MAX_AUTO_RETRIES) {
    return {
      status: 'REVIEW_NEEDED',
      retryCount: newRetryCount,
      nextRetryAt: computeNextRetryTimestamp(newRetryCount, now),
      errorMessage:
        syncOutcome.errorMessage || `Exceeded maximum auto-retries (${MAX_AUTO_RETRIES}). Terminal operator attention required.`,
    };
  }

  return {
    status: 'PENDING',
    retryCount: newRetryCount,
    nextRetryAt: computeNextRetryTimestamp(newRetryCount, now),
    errorMessage: syncOutcome.errorMessage || 'Network timeout or unreachable server',
  };
}
