/**
 * Conflict policy per kind of data. Last-write-wins is not used for anything
 * financial or for inventory. See docs/ARCHITECTURE.md §6 for the reasoning.
 */
export type ConflictStrategy =
  /** Server is the source of truth; devices replace their copy on pull. */
  | 'server_authoritative'
  /** Immutable records; corrections are new compensating events (void, refund). */
  | 'append_only_immutable'
  /** Signed quantity deltas; totals are derived, never overwritten. */
  | 'append_only_ledger';

export interface ConflictPolicy {
  strategy: ConflictStrategy;
  /** Conditions that create a conflict record for manager review instead of failing silently. */
  reviewWhen: readonly string[];
}

export const CONFLICT_POLICIES = {
  catalogue: {
    strategy: 'server_authoritative',
    reviewWhen: ['a sale references a product deleted or deactivated after the device snapshot'],
  },
  prices: {
    strategy: 'server_authoritative',
    reviewWhen: [
      'a sale used a price_list_version older than the version current at occurred_at by more than the tenant tolerance',
    ],
  },
  stock: {
    strategy: 'append_only_ledger',
    reviewWhen: ['applying the movement takes on-hand stock below zero where the tenant forbids negative stock'],
  },
  payments: {
    strategy: 'append_only_immutable',
    reviewWhen: ['a pending_confirmation payment is not confirmed within the tenant window', 'reference reused'],
  },
  completed_sales: {
    strategy: 'append_only_immutable',
    reviewWhen: [
      'same event_id arrives with a different payload hash',
      'device_sequence gap detected',
      'register or device was revoked before occurred_at',
      'totals fail server re-validation',
      'actor_user_id was not active staff of the business when the sale occurred (unknown_actor; the sale is kept)',
      'the sale names a customer the business does not have (unknown_customer; the sale is kept)',
    ],
  },
  customers: {
    strategy: 'server_authoritative',
    reviewWhen: [],
  },
  staff: {
    strategy: 'server_authoritative',
    reviewWhen: [],
  },
  subscriptions: {
    strategy: 'server_authoritative',
    reviewWhen: ['sales recorded while offline past the entitlement grace deadline'],
  },
} as const satisfies Record<string, ConflictPolicy>;
