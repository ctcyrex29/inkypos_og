import type { SyncAckResult } from './events';

/**
 * Local sync state of a committed transaction, as shown to the cashier.
 * `local`        committed on this device, never sent.
 * `pending`      sent at least once; no final acknowledgement yet.
 * `synced`       the server acknowledged it (accepted or duplicate).
 * `needs_review` the server stored a conflict or rejected it; a manager must act.
 *
 * There is no transition that deletes or drops an entry.
 */
export type LocalSyncState = 'local' | 'pending' | 'synced' | 'needs_review';

export type SyncOutcome =
  | { kind: 'attempt_started' }
  | { kind: 'transport_failed' }
  | { kind: 'acknowledged'; result: SyncAckResult }
  | { kind: 'review_resolved' };

export class InvalidSyncTransition extends Error {
  override readonly name = 'InvalidSyncTransition';
}

export function nextSyncState(current: LocalSyncState, outcome: SyncOutcome): LocalSyncState {
  switch (outcome.kind) {
    case 'attempt_started':
    case 'transport_failed':
      if (current === 'local' || current === 'pending') return 'pending';
      break;
    case 'acknowledged':
      // A late or repeated acknowledgement for something already settled is harmless.
      if (current === 'synced' && (outcome.result === 'accepted' || outcome.result === 'duplicate')) return 'synced';
      if (current === 'local' || current === 'pending') {
        return outcome.result === 'accepted' || outcome.result === 'duplicate' ? 'synced' : 'needs_review';
      }
      break;
    case 'review_resolved':
      if (current === 'needs_review') return 'synced';
      break;
  }
  throw new InvalidSyncTransition(`Cannot apply ${outcome.kind} to ${current}`);
}

export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = { baseMs: 2_000, maxMs: 5 * 60_000 };

/**
 * Exponential backoff with full jitter. A server Retry-After value, when
 * present, is honoured as a floor.
 */
export function retryDelayMs(
  attempt: number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
  random: () => number = Math.random,
  retryAfterMs?: number,
): number {
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError('attempt must be a non-negative integer');
  const ceiling = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.min(attempt, 30));
  const jittered = Math.floor(random() * ceiling);
  return Math.max(jittered, retryAfterMs ?? 0);
}
