import { describe, expect, it } from 'vitest';
import { CONFLICT_POLICIES, InvalidSyncTransition, nextSyncState, retryDelayMs } from '../src';

describe('local sync state', () => {
  it('moves local -> pending -> synced', () => {
    const pending = nextSyncState('local', { kind: 'attempt_started' });
    expect(pending).toBe('pending');
    expect(nextSyncState(pending, { kind: 'transport_failed' })).toBe('pending');
    expect(nextSyncState(pending, { kind: 'acknowledged', result: 'accepted' })).toBe('synced');
  });

  it('treats a duplicate acknowledgement as success (lost-ack recovery)', () => {
    expect(nextSyncState('pending', { kind: 'acknowledged', result: 'duplicate' })).toBe('synced');
    expect(nextSyncState('synced', { kind: 'acknowledged', result: 'duplicate' })).toBe('synced');
  });

  it('routes conflicts and rejections to review instead of dropping them', () => {
    expect(nextSyncState('pending', { kind: 'acknowledged', result: 'conflict' })).toBe('needs_review');
    expect(nextSyncState('pending', { kind: 'acknowledged', result: 'rejected' })).toBe('needs_review');
    expect(nextSyncState('needs_review', { kind: 'review_resolved' })).toBe('synced');
  });

  it('refuses transitions that would reopen settled entries', () => {
    expect(() => nextSyncState('synced', { kind: 'attempt_started' })).toThrow(InvalidSyncTransition);
    expect(() => nextSyncState('synced', { kind: 'acknowledged', result: 'conflict' })).toThrow(InvalidSyncTransition);
    expect(() => nextSyncState('needs_review', { kind: 'attempt_started' })).toThrow(InvalidSyncTransition);
  });
});

describe('retry backoff', () => {
  it('grows exponentially up to the cap', () => {
    const top = () => 0.999_999;
    expect(retryDelayMs(0, { baseMs: 1000, maxMs: 60_000 }, top)).toBe(999);
    expect(retryDelayMs(3, { baseMs: 1000, maxMs: 60_000 }, top)).toBe(7999);
    expect(retryDelayMs(40, { baseMs: 1000, maxMs: 60_000 }, top)).toBe(59_999);
  });

  it('applies full jitter and honours Retry-After as a floor', () => {
    expect(retryDelayMs(5, { baseMs: 1000, maxMs: 60_000 }, () => 0)).toBe(0);
    expect(retryDelayMs(5, { baseMs: 1000, maxMs: 60_000 }, () => 0, 30_000)).toBe(30_000);
  });
});

describe('conflict policies', () => {
  it('never uses last-write-wins for money or stock', () => {
    expect(CONFLICT_POLICIES.completed_sales.strategy).toBe('append_only_immutable');
    expect(CONFLICT_POLICIES.payments.strategy).toBe('append_only_immutable');
    expect(CONFLICT_POLICIES.stock.strategy).toBe('append_only_ledger');
  });
});
