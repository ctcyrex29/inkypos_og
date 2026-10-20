import { describe, expect, it } from 'vitest';
import {
  ApiError,
  buildSampleSale,
  createLocalStore,
  MemoryDriver,
  SyncWorker,
  uuidv7,
  type SyncAckResult,
  type SyncPushResponse,
  type SyncTransport,
} from '../src';

const ids = { tenant: uuidv7(), branch: uuidv7(), register: uuidv7(), device: uuidv7() };

/** Server double: idempotent by event_id, records every request body it receives. */
function fakeServer() {
  const stored = new Map<string, string>(); // event_id -> body
  const requests: { batchId: string; bodies: string[] }[] = [];
  const state = {
    failNext: null as null | (() => never),
    loseAckNext: false,
    verdict: (_body: string): SyncAckResult => 'accepted',
    dropAcksFor: new Set<string>(),
  };
  const transport: SyncTransport = {
    async push(batchId, deviceId, bodies) {
      expect(deviceId).toBe(ids.device);
      requests.push({ batchId, bodies });
      if (state.failNext) {
        const fail = state.failNext;
        state.failNext = null;
        fail();
      }
      const acknowledgements = bodies.flatMap((body) => {
        const event = JSON.parse(body) as { event_id: string };
        const seen = stored.has(event.event_id);
        if (!seen) stored.set(event.event_id, body);
        if (state.dropAcksFor.has(event.event_id)) return [];
        return [{ event_id: event.event_id, result: seen ? ('duplicate' as const) : state.verdict(body) }];
      });
      if (state.loseAckNext) {
        state.loseAckNext = false;
        throw new ApiError('Network error: connection reset', 'network_error', null, 'r', true);
      }
      return { batch_id: batchId, server_time: new Date().toISOString(), acknowledgements } satisfies SyncPushResponse;
    },
  };
  return { transport, stored, requests, state };
}

async function setup(sales = 3, options: { batchSize?: number } = {}) {
  const clock = { now: Date.parse('2026-10-20T10:00:00Z') };
  const store = createLocalStore(new MemoryDriver(), { now: () => new Date(clock.now) });
  await store.migrate();
  for (let i = 0; i < sales; i++) {
    await store.sales.commitSale(
      buildSampleSale({ newId: () => uuidv7(), tenantId: ids.tenant, branchId: ids.branch, registerId: ids.register, deviceId: ids.device, actorId: ids.device }),
    );
  }
  const server = fakeServer();
  const worker = new SyncWorker({
    store,
    transport: server.transport,
    deviceId: () => ids.device,
    newId: () => uuidv7(),
    now: () => new Date(clock.now),
    random: () => 0.5,
    backoff: { baseMs: 1000, maxMs: 60_000 },
    ...options,
  });
  return { store, server, worker, clock };
}

describe('SyncWorker', () => {
  it('uploads everything in sequence order and marks it synced', async () => {
    const { store, server, worker } = await setup(3);

    expect(await worker.runOnce()).toMatchObject({ sent: 3, acknowledged: 3, stoppedBy: 'idle' });
    const sequences = server.requests[0]!.bodies.map((b) => JSON.parse(b).device_sequence);
    expect(sequences).toEqual([1, 2, 3]);
    expect(await store.outbox.countByState()).toEqual({ local: 0, pending: 0, synced: 3, needs_review: 0 });
    expect(server.requests[0]!.bodies[0]).toBe((await store.outbox.get(JSON.parse(server.requests[0]!.bodies[0]!).event_id))?.body);
  });

  it('backs off while offline and later resends the identical bytes', async () => {
    const { store, server, worker, clock } = await setup(2);
    server.state.failNext = () => {
      throw new ApiError('Network error: offline', 'network_error', null, 'r', true);
    };

    expect(await worker.runOnce()).toMatchObject({ stoppedBy: 'transport', error: { code: 'network_error' } });
    expect(await store.outbox.countByState()).toMatchObject({ pending: 2 });

    // Still inside the backoff window: nothing is sent.
    clock.now += 100;
    expect((await worker.runOnce()).sent).toBe(0);
    expect(server.requests).toHaveLength(1);

    clock.now += 10_000;
    expect(await worker.runOnce()).toMatchObject({ sent: 2, stoppedBy: 'idle' });
    expect(server.requests[1]!.bodies).toEqual(server.requests[0]!.bodies);
    expect(server.requests[1]!.batchId).not.toBe(server.requests[0]!.batchId);
  });

  it('reports backoff rather than idle while sales are still waiting, and a manual sync skips the wait', async () => {
    const { store, server, worker, clock } = await setup(1);
    server.state.failNext = () => {
      throw new ApiError('Network error: offline', 'network_error', null, 'r', true);
    };
    await worker.runOnce();

    clock.now += 100;
    expect(await worker.runOnce()).toMatchObject({ sent: 0, stoppedBy: 'backoff' });
    expect(await worker.runOnce({ force: true })).toMatchObject({ sent: 1, stoppedBy: 'idle' });
    expect(await store.outbox.countByState()).toMatchObject({ synced: 1 });
  });

  it('recovers from a lost acknowledgement without creating a second sale', async () => {
    const { store, server, worker, clock } = await setup(1);
    server.state.loseAckNext = true; // server stores the event, response never arrives

    await worker.runOnce();
    expect(server.stored.size).toBe(1);
    expect(await store.outbox.countByState()).toMatchObject({ pending: 1 });

    clock.now += 60_000;
    await worker.runOnce();
    expect(server.stored.size).toBe(1);
    const entry = (await store.outbox.due('2100-01-01T00:00:00Z', 10))[0];
    expect(entry).toBeUndefined();
    expect(await store.outbox.countByState()).toMatchObject({ synced: 1, pending: 0 });
  });

  it('retries only the events the server did not acknowledge', async () => {
    const { store, server, worker, clock } = await setup(3);
    const second = JSON.parse((await store.outbox.due('2100-01-01T00:00:00Z', 3))[1]!.body).event_id as string;
    server.state.dropAcksFor.add(second);

    expect(await worker.runOnce()).toMatchObject({ acknowledged: 2, stoppedBy: 'transport', error: { code: 'missing_ack' } });
    expect((await store.outbox.get(second))?.state).toBe('pending');

    server.state.dropAcksFor.clear();
    clock.now += 60_000;
    await worker.runOnce();
    expect(server.requests.at(-1)!.bodies).toHaveLength(1);
    expect(await store.outbox.countByState()).toMatchObject({ synced: 3 });
  });

  it('sends conflicts and rejections to review and never resends them', async () => {
    const { store, server, worker, clock } = await setup(2);
    let n = 0;
    server.state.verdict = () => (n++ === 0 ? 'conflict' : 'rejected');

    await worker.runOnce();
    expect(await store.outbox.countByState()).toMatchObject({ needs_review: 2 });
    clock.now += 3_600_000;
    expect((await worker.runOnce()).sent).toBe(0);
    expect((await store.exportRecoveryBundle()).entries).toHaveLength(2);
  });

  it('stops on authentication problems and keeps everything queued', async () => {
    const { store, server, worker } = await setup(2);
    server.state.failNext = () => {
      throw new ApiError('This device has been revoked.', 'device_revoked', 403, 'r', false);
    };

    expect(await worker.runOnce()).toMatchObject({ stoppedBy: 'auth', error: { code: 'device_revoked' } });
    expect(await store.outbox.countByState()).toMatchObject({ pending: 2 });
  });

  it('honours Retry-After from the server', async () => {
    const { store, server, worker } = await setup(1);
    server.state.failNext = () => {
      throw new ApiError('Too many requests.', 'rate_limited', 429, 'r', true, undefined, 45_000);
    };

    await worker.runOnce();
    const entry = (await store.outbox.due('2100-01-01T00:00:00Z', 1))[0]!;
    expect(Date.parse(entry.next_attempt_at!) - Date.parse('2026-10-20T10:00:00Z')).toBe(45_000);
  });

  it('splits large queues into ordered batches', async () => {
    const { server, worker } = await setup(7, { batchSize: 3 });

    expect(await worker.runOnce()).toMatchObject({ sent: 7, stoppedBy: 'idle' });
    expect(server.requests.map((r) => r.bodies.length)).toEqual([3, 3, 1]);
    const all = server.requests.flatMap((r) => r.bodies.map((b) => JSON.parse(b).device_sequence));
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('runs one sync at a time', async () => {
    const { server, worker } = await setup(2);
    const [a, b] = await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(a).toBe(b);
    expect(server.requests).toHaveLength(1);
  });

  it('does nothing before the device is enrolled', async () => {
    const { store } = await setup(1);
    const worker = new SyncWorker({ store, transport: fakeServer().transport, deviceId: () => null, newId: () => uuidv7() });
    expect(await worker.runOnce()).toEqual({ sent: 0, acknowledged: 0, stoppedBy: 'not_enrolled' });
  });
});
