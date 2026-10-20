import { ApiError } from '../api/client';
import type { LocalStore, OutboxEntry } from '../storage/ports';
import type { SyncPushResponse } from './events';
import { DEFAULT_BACKOFF, retryDelayMs, type BackoffPolicy } from './state';

/** Uploads a batch of stored event bodies. Implemented by the API client (behind device auth). */
export interface SyncTransport {
  push(batchId: string, deviceId: string, eventBodies: string[]): Promise<SyncPushResponse>;
}

export interface SyncWorkerOptions {
  store: LocalStore;
  transport: SyncTransport;
  /** Null while the device is not enrolled; the worker then does nothing. */
  deviceId: () => string | null;
  newId: () => string;
  now?: () => Date;
  random?: () => number;
  batchSize?: number;
  maxBatchesPerRun?: number;
  backoff?: BackoffPolicy;
}

/** idle: nothing left to send. backoff: entries remain but are waiting out a retry delay. */
export type SyncStop = 'idle' | 'backoff' | 'not_enrolled' | 'transport' | 'auth' | 'batch_limit';

export interface SyncRunOptions {
  /** A person asked to sync now: ignore retry delays for this run. */
  force?: boolean;
}

const END_OF_TIME = '9999-12-31T23:59:59.999Z';

export interface SyncRunResult {
  sent: number;
  acknowledged: number;
  stoppedBy: SyncStop;
  error?: { code: string; message: string };
}

/** Failures the worker cannot fix by retrying; the device session must act first. */
const AUTH_CODES = new Set(['unauthenticated', 'device_revoked', 'forbidden', 'subscription_inactive']);

/**
 * Moves outbox entries to the server, oldest first.
 *
 * - Sends each entry's stored bytes, so every retry is byte-identical.
 * - Marks the attempt before sending: if the app dies mid-request the entry
 *   stays due, and the server's idempotency turns the resend into `duplicate`.
 * - Never deletes anything; conflicts and rejections go to needs_review.
 * - One run at a time: concurrent calls share the run in progress.
 */
export class SyncWorker {
  private running: Promise<SyncRunResult> | null = null;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly batchSize: number;
  private readonly maxBatches: number;
  private readonly backoff: BackoffPolicy;

  constructor(private readonly options: SyncWorkerOptions) {
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.batchSize = Math.min(options.batchSize ?? 50, 100);
    this.maxBatches = options.maxBatchesPerRun ?? 20;
    this.backoff = options.backoff ?? DEFAULT_BACKOFF;
  }

  runOnce(options: SyncRunOptions = {}): Promise<SyncRunResult> {
    this.running ??= this.run(options.force ?? false).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(force: boolean): Promise<SyncRunResult> {
    const deviceId = this.options.deviceId();
    if (!deviceId) return { sent: 0, acknowledged: 0, stoppedBy: 'not_enrolled' };
    const { store, transport, newId } = this.options;
    let sent = 0;
    let acknowledged = 0;

    for (let batch = 0; batch < this.maxBatches; batch++) {
      // Only the first batch of a forced run skips the delays; later batches follow normal rules.
      const cutoff = force && batch === 0 ? END_OF_TIME : this.now().toISOString();
      const due = await store.outbox.due(cutoff, this.batchSize);
      if (due.length === 0) {
        const counts = await store.outbox.countByState();
        return { sent, acknowledged, stoppedBy: counts.local + counts.pending > 0 ? 'backoff' : 'idle' };
      }
      const ids = due.map((e) => e.event_id);

      await store.outbox.markAttempt(ids, this.now().toISOString());
      let response: SyncPushResponse;
      try {
        response = await transport.push(newId(), deviceId, due.map((e) => e.body));
        sent += due.length;
      } catch (e) {
        const error = describe(e);
        await store.outbox.markTransportFailure(ids, `${error.code}: ${error.message}`, this.retryAt(due, e));
        return { sent, acknowledged, stoppedBy: AUTH_CODES.has(error.code) ? 'auth' : 'transport', error };
      }

      const result = await store.outbox.applyAcknowledgements(
        response.acknowledgements.map((a) => ({
          event_id: a.event_id,
          result: a.result,
          ...(a.conflict_id ? { conflict_id: a.conflict_id } : {}),
          ...(a.error ? { error: `${a.error.code}: ${a.error.message}` } : {}),
        })),
        this.now().toISOString(),
      );
      acknowledged += result.applied;

      // Anything the server did not answer for is retried later, never assumed delivered.
      const answered = new Set(response.acknowledgements.map((a) => a.event_id));
      const missing = ids.filter((id) => !answered.has(id));
      if (missing.length > 0) {
        await store.outbox.markTransportFailure(missing, 'missing_ack: server did not acknowledge this event', this.retryAt(due, null));
        return { sent, acknowledged, stoppedBy: 'transport', error: { code: 'missing_ack', message: `${missing.length} events unacknowledged` } };
      }
    }
    return { sent, acknowledged, stoppedBy: 'batch_limit' };
  }

  private retryAt(due: OutboxEntry[], error: unknown): string {
    const attempts = Math.max(...due.map((e) => e.attempts)); // attempts before this one
    const permanent = error instanceof ApiError && !error.retryable && !AUTH_CODES.has(error.code);
    const delay = permanent
      ? this.backoff.maxMs
      : retryDelayMs(attempts, this.backoff, this.random, error instanceof ApiError ? error.retryAfterMs : undefined);
    return new Date(this.now().getTime() + delay).toISOString();
  }
}

function describe(e: unknown): { code: string; message: string } {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'unknown', message: e instanceof Error ? e.message : String(e) };
}
