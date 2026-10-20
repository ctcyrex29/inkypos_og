import { priceLine } from '../sales/pricing';
import type { Migration } from './driver';
import { DuplicateSaleError } from './local-store';
import type { CatalogueProduct, LocalStore, UnsequencedSaleEvent } from './ports';
import { MIGRATIONS } from './schema';

/**
 * Storage contract: behaviour every driver must show. Framework-free so the
 * same scenarios run under vitest (memory, node:sqlite, fake IndexedDB) and on
 * a real device from the app's Diagnostics screen (expo-sqlite, browser IndexedDB).
 */

export interface StoreHarness {
  /** Opens (or reopens, after close) the same database. */
  open(migrations?: Migration[]): Promise<LocalStore>;
  /** Closes and deletes the database. */
  destroy(): Promise<void>;
}

export type HarnessFactory = () => Promise<StoreHarness>;

export interface ContractCase {
  name: string;
  run(make: HarnessFactory, newId: () => string): Promise<void>;
}

export interface ContractResult {
  name: string;
  ok: boolean;
  error?: string;
  ms: number;
}

// ── Assertions ─────────────────────────────────────────────────────────────

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, got ${a}`);
}

async function rejects(promise: Promise<unknown>, check: (e: unknown) => boolean, message: string): Promise<void> {
  try {
    await promise;
  } catch (e) {
    if (check(e)) return;
    throw new Error(`${message}: wrong error ${String((e as Error)?.message ?? e)}`);
  }
  throw new Error(`${message}: expected a rejection`);
}

// ── Fixtures ───────────────────────────────────────────────────────────────

function saleEvent(
  newId: () => string,
  ctx: { tenant: string; device: string; productA: string; productB: string },
  overrides: { saleId?: string; movementIds?: [string, string]; completedAt?: string } = {},
): UnsequencedSaleEvent {
  const saleId = overrides.saleId ?? newId();
  const a = priceLine({ unitPriceMinor: 250, quantityMilli: 2000, discountMinor: 0, taxRateBasisPoints: 1500, taxInclusive: true, rounding: 'half_away_from_zero' });
  const b = priceLine({ unitPriceMinor: 99, quantityMilli: 1500, discountMinor: 9, taxRateBasisPoints: 0, taxInclusive: true, rounding: 'half_away_from_zero' });
  const total = a.totalMinor + b.totalMinor;
  const completedAt = overrides.completedAt ?? '2026-10-20T09:00:00+02:00';
  const [m1, m2] = overrides.movementIds ?? [newId(), newId()];
  return {
    schema_version: 1,
    event_id: newId(),
    event_type: 'sale.completed',
    occurred_at: completedAt,
    tenant_id: ctx.tenant,
    branch_id: ctx.tenant,
    register_id: ctx.tenant,
    device_id: ctx.device,
    actor_user_id: ctx.device,
    aggregate_id: saleId,
    payload: {
      sale_id: saleId,
      receipt_number: `T1-${saleId.slice(-6)}`,
      currency: 'USD',
      rounding: 'half_away_from_zero',
      catalogue_version: 1,
      price_list_version: 1,
      completed_at: completedAt,
      lines: [
        {
          line_id: newId(),
          product_id: ctx.productA,
          sku: 'A',
          name: 'Product A',
          quantity_milli: 2000,
          unit_price_minor: 250,
          discount_minor: 0,
          tax: { code: 'VAT15', rate_bp: 1500, inclusive: true, amount_minor: a.taxMinor },
          line_total_minor: a.totalMinor,
        },
        {
          line_id: newId(),
          product_id: ctx.productB,
          sku: 'B',
          name: 'Product B',
          quantity_milli: 1500,
          unit_price_minor: 99,
          discount_minor: 9,
          tax: { code: 'ZERO', rate_bp: 0, inclusive: true, amount_minor: 0 },
          line_total_minor: b.totalMinor,
        },
      ],
      totals: { subtotal_minor: a.extendedMinor + b.extendedMinor, discount_minor: 9, tax_minor: a.taxMinor, total_minor: total },
      payments: [{ payment_id: newId(), method_code: 'cash', status: 'recorded', currency: 'USD', amount_minor: 1000, sale_currency_amount_minor: 1000 }],
      change_minor: 1000 - total,
      stock_movements: [
        { movement_id: m1, product_id: ctx.productA, quantity_delta_milli: -2000 },
        { movement_id: m2, product_id: ctx.productB, quantity_delta_milli: -1500 },
      ],
    },
  };
}

function context(newId: () => string) {
  return { tenant: newId(), device: newId(), productA: newId(), productB: newId() };
}

function product(id: string, name: string, barcodes: string[], active = true): CatalogueProduct {
  return { product_id: id, sku: name.toUpperCase().replace(/\s/g, '-'), barcodes, name, unit_price_minor: 100, tax_code: 'VAT15', tax_rate_bp: 1500, tax_inclusive: true, active, version: 1 };
}

async function withStore(make: HarnessFactory, fn: (store: LocalStore, h: StoreHarness) => Promise<void>): Promise<void> {
  const h = await make();
  try {
    const store = await h.open();
    await store.migrate();
    await fn(store, h);
  } finally {
    await h.destroy();
  }
}

// ── Scenarios ──────────────────────────────────────────────────────────────

export const STORAGE_CONTRACT: ContractCase[] = [
  {
    name: 'migrates an empty database exactly once',
    async run(make) {
      const h = await make();
      try {
        let store = await h.open();
        const first = await store.migrate();
        equal([first.from, first.to, first.applied.length], [0, MIGRATIONS.length, MIGRATIONS.length], 'first migration');
        equal((await store.info()).schemaVersion, MIGRATIONS.length, 'schema version');
        await store.close();
        store = await h.open();
        const second = await store.migrate();
        equal(second.applied.length, 0, 'second open applies nothing');
        await store.close();
      } finally {
        await h.destroy();
      }
    },
  },
  {
    name: 'upgrades an existing database with a later migration',
    async run(make) {
      const h = await make();
      try {
        let store = await h.open();
        await store.migrate();
        await store.settings.set('printer', 'front');
        await store.close();

        const v2: Migration = {
          version: MIGRATIONS.at(-1)!.version + 1,
          name: 'test_upgrade',
          steps: [
            { op: 'createIndex', store: 'settings', index: { name: 'by_value', fields: ['v'] } },
            { op: 'transform', store: 'settings', fn: (row) => ({ ...row, v: String(row.v).toUpperCase() }) },
          ],
        };
        store = await h.open([...MIGRATIONS, v2]);
        const report = await store.migrate();
        equal(report.applied.map((m) => m.name), ['test_upgrade'], 'applied');
        equal(await store.settings.get('printer'), 'FRONT', 'existing row transformed');
        equal((await store.info()).schemaVersion, v2.version, 'schema version');
        await store.close();
      } finally {
        await h.destroy();
      }
    },
  },
  {
    name: 'commits a sale, its stock movements and its outbox entry together',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const ctx = context(newId);
        const e1 = await store.sales.commitSale(saleEvent(newId, ctx));
        const e2 = await store.sales.commitSale(saleEvent(newId, ctx));
        equal([e1.device_sequence, e2.device_sequence], [1, 2], 'sequences');
        equal(e1.state, 'local', 'new entry state');
        assert(/^[0-9a-f]{64}$/.test(e1.body_sha256), 'body hash');
        equal(JSON.parse(e1.body).device_sequence, 1, 'sequence inside the signed body');
        const sale = await store.sales.get(e1.aggregate_id);
        equal(sale?.sync_state, 'local', 'sale state');
        equal(sale?.device_sequence, 1, 'sale sequence');
        equal(await store.stock.localDeltaMilli(ctx.productA), -4000, 'stock delta A');
        equal(await store.outbox.lastSequence(), 2, 'last sequence');
        equal(await store.outbox.countByState(), { local: 2, pending: 0, synced: 0, needs_review: 0 }, 'counts');
      });
    },
  },
  {
    name: 'refuses a duplicate sale without consuming a sequence',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const ctx = context(newId);
        const event = saleEvent(newId, ctx);
        await store.sales.commitSale(event);
        await rejects(store.sales.commitSale({ ...event, event_id: newId() }), (e) => e instanceof DuplicateSaleError, 'duplicate sale');
        equal(await store.outbox.lastSequence(), 1, 'sequence unchanged');
      });
    },
  },
  {
    name: 'rolls back every write when a later record conflicts',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const ctx = context(newId);
        const first = saleEvent(newId, ctx);
        await store.sales.commitSale(first);
        // The sale row is written, then a stock movement collides: nothing may remain.
        const clash = saleEvent(newId, ctx, { movementIds: [newId(), first.payload.stock_movements[0]!.movement_id] });
        await rejects(store.sales.commitSale(clash), (e) => e instanceof DuplicateSaleError, 'conflicting movement');
        equal(await store.sales.get(clash.payload.sale_id), null, 'partial sale rolled back');
        equal(await store.outbox.lastSequence(), 1, 'sequence rolled back');
        equal(await store.stock.localDeltaMilli(ctx.productB), -1500, 'stock rolled back');
        equal((await store.outbox.countByState()).local, 1, 'outbox rolled back');
      });
    },
  },
  {
    name: 'rejects an invalid sale before writing anything',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const bad = saleEvent(newId, context(newId));
        bad.payload.totals.total_minor += 1;
        await rejects(store.sales.commitSale(bad), (e) => /total/.test(String((e as Error).message)), 'invalid totals');
        equal(await store.outbox.lastSequence(), 0, 'nothing written');
      });
    },
  },
  {
    name: 'keeps committed sales and exact outbox bytes across a restart',
    async run(make, newId) {
      const h = await make();
      try {
        let store = await h.open();
        await store.migrate();
        const entry = await store.sales.commitSale(saleEvent(newId, context(newId)));
        await store.close();

        store = await h.open();
        await store.migrate();
        const reloaded = await store.outbox.get(entry.event_id);
        equal(reloaded?.body, entry.body, 'body bytes');
        equal(reloaded?.body_sha256, entry.body_sha256, 'body hash');
        equal((await store.sales.get(entry.aggregate_id))?.sale.sale_id, entry.aggregate_id, 'sale survives');
        equal(await store.outbox.lastSequence(), 1, 'sequence survives');
        await store.close();
      } finally {
        await h.destroy();
      }
    },
  },
  {
    name: 'returns due entries in sequence order and honours backoff',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const ctx = context(newId);
        const entries = [];
        for (let i = 0; i < 3; i++) entries.push(await store.sales.commitSale(saleEvent(newId, ctx)));
        const ids = entries.map((e) => e.event_id);

        equal((await store.outbox.due('2026-10-20T10:00:00Z', 10)).map((e) => e.device_sequence), [1, 2, 3], 'initially due');
        await store.outbox.markAttempt(ids, '2026-10-20T10:00:00Z');
        await store.outbox.markTransportFailure(ids, 'offline', '2026-10-20T10:05:00Z');
        equal((await store.outbox.due('2026-10-20T10:01:00Z', 10)).length, 0, 'backing off');
        const later = await store.outbox.due('2026-10-20T10:06:00Z', 2);
        equal(later.map((e) => e.device_sequence), [1, 2], 'due again, limited, in order');
        equal(later[0]?.state, 'pending', 'pending after an attempt');
        equal(later[0]?.attempts, 1, 'attempt counted');
        equal(later[0]?.last_error, 'offline', 'error kept');
      });
    },
  },
  {
    name: 'applies acknowledgements and never drops an entry',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const ctx = context(newId);
        const e = [];
        for (let i = 0; i < 4; i++) e.push(await store.sales.commitSale(saleEvent(newId, ctx)));
        await store.outbox.markAttempt(e.map((x) => x.event_id), '2026-10-20T10:00:00Z');
        const conflictId = newId();
        const result = await store.outbox.applyAcknowledgements(
          [
            { event_id: e[0]!.event_id, result: 'accepted' },
            { event_id: e[1]!.event_id, result: 'duplicate' },
            { event_id: e[2]!.event_id, result: 'conflict', conflict_id: conflictId },
            { event_id: e[3]!.event_id, result: 'rejected', error: 'totals_mismatch' },
            { event_id: newId(), result: 'accepted' },
          ],
          '2026-10-20T10:00:05Z',
        );
        equal([result.applied, result.unknown.length], [4, 1], 'applied/unknown');
        equal(await store.outbox.countByState(), { local: 0, pending: 0, synced: 2, needs_review: 2 }, 'counts');
        equal((await store.sales.get(e[2]!.aggregate_id))?.sync_state, 'needs_review', 'sale follows outbox');
        equal((await store.outbox.get(e[2]!.event_id))?.conflict_id, conflictId, 'conflict id kept');
        equal((await store.outbox.due('2026-10-21T00:00:00Z', 10)).length, 0, 'nothing left to send');
        const bundle = await store.exportRecoveryBundle();
        equal(bundle.entries.map((x) => x.device_sequence), [3, 4], 'review items are still exportable');
      });
    },
  },
  {
    name: 'treats a repeated acknowledgement as harmless (lost-ack recovery)',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const entry = await store.sales.commitSale(saleEvent(newId, context(newId)));
        await store.outbox.markAttempt([entry.event_id], '2026-10-20T10:00:00Z');
        // First response was lost; the retry gets "duplicate", then a stale "accepted" arrives.
        await store.outbox.applyAcknowledgements([{ event_id: entry.event_id, result: 'duplicate' }], '2026-10-20T10:01:00Z');
        await store.outbox.applyAcknowledgements([{ event_id: entry.event_id, result: 'accepted' }], '2026-10-20T10:02:00Z');
        await store.outbox.applyAcknowledgements([{ event_id: entry.event_id, result: 'conflict' }], '2026-10-20T10:03:00Z');
        const final = await store.outbox.get(entry.event_id);
        equal(final?.state, 'synced', 'still synced');
        equal(final?.acknowledged_at, '2026-10-20T10:01:00Z', 'first acknowledgement time kept');
      });
    },
  },
  {
    name: 'maintains the catalogue, barcodes and name search',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const [cola, chips, bread] = [newId(), newId(), newId()];
        const snapshot = { catalogue_version: 3, price_list_version: 2, pulled_at: '2026-10-20T08:00:00Z', cursor: 'c3' };
        await store.catalogue.applyChanges(
          [product(cola, 'Coca-Cola 500ml', ['600123']), product(chips, 'Chips', ['600999']), product(bread, 'Bread', ['600555'], false)],
          [],
          snapshot,
        );
        equal((await store.catalogue.findByBarcode('600123'))?.product_id, cola, 'barcode lookup');
        equal((await store.catalogue.search('coca', 5)).map((p) => p.product_id), [cola], 'prefix search, case-insensitive');
        equal(await store.catalogue.snapshot(), snapshot, 'snapshot');

        // Barcode moves from chips to cola; bread is removed.
        await store.catalogue.applyChanges([product(cola, 'Coca-Cola 500ml', ['600123', '600999']), product(chips, 'Chips', [])], [bread], { ...snapshot, cursor: 'c4' });
        equal((await store.catalogue.findByBarcode('600999'))?.product_id, cola, 'barcode reassigned');
        equal(await store.catalogue.findByBarcode('600555'), null, 'removed product barcode gone');
        equal((await store.catalogue.snapshot())?.cursor, 'c4', 'cursor advanced');
      });
    },
  },
  {
    name: 'stores settings',
    async run(make) {
      await withStore(make, async (store) => {
        equal(await store.settings.get('missing'), null, 'missing key');
        await store.settings.set('receipt_width', '42');
        await store.settings.set('receipt_width', '48');
        equal(await store.settings.get('receipt_width'), '48', 'overwrite');
      });
    },
  },
];

/** Runs every scenario and reports each result; never throws. */
export async function runStorageContract(
  make: HarnessFactory,
  newId: () => string,
  onResult?: (result: ContractResult) => void,
): Promise<ContractResult[]> {
  const results: ContractResult[] = [];
  for (const c of STORAGE_CONTRACT) {
    const started = Date.now();
    let result: ContractResult;
    try {
      await c.run(make, newId);
      result = { name: c.name, ok: true, ms: Date.now() - started };
    } catch (e) {
      result = { name: c.name, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
    }
    results.push(result);
    onResult?.(result);
  }
  return results;
}
