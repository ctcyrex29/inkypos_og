import { priceLine } from '../sales/pricing';
import type { Migration } from './driver';
import { DuplicateSaleError } from './local-store';
import type { StaffInfo, StaffPinHash } from '../catalogue/contracts';
import type { CatalogueProduct, LocalStore, PullChange, UnsequencedSaleEvent } from './ports';
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
  return { product_id: id, sku: name.toUpperCase().replace(/\s/g, '-'), barcodes, name, unit: 'each', unit_price_minor: 100, tax_code: 'VAT15', tax_rate_bp: 1500, tax_inclusive: true, active, version: 1 };
}

/** Shape-valid published hash; these scenarios test storage, not PIN maths. */
const PIN_FIXTURE: StaffPinHash = { algorithm: 'pbkdf2-sha256', iterations: 10_000, salt: 'AAAAAAAAAAAAAAAAAAAAAA', hash: 'B'.repeat(43) };

function staffChange(id: string, name: string, role: StaffInfo['role'], overrides: Partial<StaffInfo> = {}): PullChange {
  const data: StaffInfo = { id, name, role, active: true, pin: PIN_FIXTURE, version: 1, ...overrides };
  return { entity: 'staff', op: 'upsert', id, version: data.version, data };
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
    name: 'upgrades a v1 till database to v2 without losing sales or products',
    async run(make, newId) {
      const h = await make();
      try {
        let store = await h.open([MIGRATIONS[0]!]);
        await store.migrate();
        const entry = await store.sales.commitSale(saleEvent(newId, context(newId)));
        const legacy = product(newId(), 'Legacy item', ['111']) as Partial<CatalogueProduct>;
        delete legacy.unit; // v1 products had no unit
        await store.catalogue.applyChanges([legacy as CatalogueProduct], [], { catalogue_version: 1, price_list_version: 1, pulled_at: '2026-10-20T08:00:00Z', cursor: '' });
        await store.close();

        store = await h.open();
        const report = await store.migrate();
        equal(report.applied.map((m) => m.version), MIGRATIONS.slice(1).map((m) => m.version), 'pending migrations applied');
        equal((await store.catalogue.findByBarcode('111'))?.unit, 'each', 'legacy product gets a unit');
        equal((await store.sales.get(entry.aggregate_id))?.device_sequence, 1, 'sale kept');
        equal(await store.outbox.lastSequence(), 1, 'sequence kept');
        equal(await store.reference.paymentMethods(), [], 'new stores start empty');
        await store.close();
      } finally {
        await h.destroy();
      }
    },
  },
  {
    name: 'applies pulled reference data atomically and refuses malformed pages',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const [tenant, branch, register, cash, card, rate1, rate2, cola] = [newId(), newId(), newId(), newId(), newId(), newId(), newId(), newId()];
        const method = (id: string, code: string, position: number, active = true) => ({
          id, code, name: code, kind: 'cash', currencies: ['USD', 'ZWG'], initial_status: 'recorded',
          requires_reference: false, gives_change: true, active, position, version: 1,
        });
        const rate = (id: string, value: string, version: number) => ({
          id, base_currency: 'USD', quote_currency: 'ZWG', rate: value, version, effective_at: '2026-10-20T08:00:00+00:00',
        });
        const up = (entity: string, id: string, data: object) => ({ entity, op: 'upsert', id, version: 1, data }) as never;

        await store.reference.applyPull(
          [
            up('business', tenant, { id: tenant, name: 'Demo Shop', base_currency: 'USD', rounding: 'half_away_from_zero', tax_rounding: 'per_line' }),
            up('branch', branch, { id: branch, name: 'Main', code: 'MAIN' }),
            up('register', register, { id: register, branch_id: branch, name: 'Till 1', code: 'T1' }),
            up('payment_method', card, method(card, 'card', 1)),
            up('payment_method', cash, method(cash, 'cash', 0)),
            up('exchange_rate', rate1, rate(rate1, '0.037', 1)),
            up('exchange_rate', rate2, rate(rate2, '0.0365', 2)),
            up('product', cola, product(cola, 'Cola', ['600123'])),
          ],
          'log:42',
        );
        equal((await store.reference.business())?.name, 'Demo Shop', 'business');
        equal((await store.reference.register(register))?.code, 'T1', 'register');
        equal((await store.reference.paymentMethods()).map((m) => m.code), ['cash', 'card'], 'methods in display order');
        equal((await store.reference.exchangeRate('USD', 'ZWG'))?.rate, '0.0365', 'newest rate wins');
        equal((await store.catalogue.findByBarcode('600123'))?.product_id, cola, 'product from the feed');
        equal([await store.reference.cursor(), await store.reference.catalogueVersion()], ['log:42', 42], 'cursor and version');

        // A malformed page changes nothing, not even the cursor.
        await rejects(
          store.reference.applyPull([up('payment_method', cash, method(cash, 'cash', 0, false)), up('product', cola, { product_id: cola })], 'log:50'),
          (e) => (e as Error).name === 'PullContractError',
          'malformed page',
        );
        equal((await store.reference.paymentMethods()).length, 2, 'earlier change in the bad page not applied');
        equal(await store.reference.cursor(), 'log:42', 'cursor unchanged');

        // Deactivation and deletion.
        await store.reference.applyPull(
          [up('payment_method', card, method(card, 'card', 1, false)), { entity: 'product', op: 'delete', id: cola, version: 1, data: null }],
          'log:51',
        );
        equal((await store.reference.paymentMethods()).map((m) => m.code), ['cash'], 'inactive methods hidden');
        equal(await store.catalogue.findByBarcode('600123'), null, 'deleted product gone');
      });
    },
  },
  {
    name: 'numbers receipts with the sequence allocated in the same transaction',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const ctx = context(newId);
        const receipt = (seq: number) => `T1-${String(seq).padStart(6, '0')}`;
        await store.sales.commitSale(saleEvent(newId, ctx), { receiptNumber: receipt });
        const second = await store.sales.commitSale(saleEvent(newId, ctx), { receiptNumber: receipt });
        equal((await store.sales.get(second.aggregate_id))?.sale.receipt_number, 'T1-000002', 'receipt number');
        equal(JSON.parse(second.body).payload.receipt_number, 'T1-000002', 'receipt number in the uploaded bytes');
      });
    },
  },
  {
    name: 'keeps pulled staff with their PIN hashes and hides inactive staff',
    async run(make, newId) {
      await withStore(make, async (store) => {
        const [zoe, amy, ben] = [newId(), newId(), newId()];
        await store.reference.applyPull(
          [staffChange(zoe, 'Zoe', 'cashier'), staffChange(amy, 'amy', 'manager', { pin: null }), staffChange(ben, 'Ben', 'cashier', { active: false })],
          'log:7',
        );
        equal((await store.staff.listActive()).map((s) => s.name), ['amy', 'Zoe'], 'active staff by name, case-insensitive');
        equal((await store.staff.get(zoe))?.pin, PIN_FIXTURE, 'PIN hash kept exactly');
        equal((await store.staff.get(ben))?.active, false, 'inactive staff still readable');
        equal((await store.staff.get(amy))?.pin, null, 'no PIN yet');

        // A malformed staff record refuses the whole page.
        await rejects(
          store.reference.applyPull([staffChange(zoe, 'Zoe', 'cashier', { pin: { ...PIN_FIXTURE, iterations: 5 } })], 'log:8'),
          (e) => (e as Error).name === 'PullContractError',
          'iterations below the floor',
        );

        await store.reference.applyPull([staffChange(zoe, 'Zoe', 'cashier', { active: false }), { entity: 'staff', op: 'delete', id: amy, version: 1, data: null }], 'log:9');
        equal(await store.staff.listActive(), [], 'deactivated and removed');
        equal(await store.staff.get(amy), null, 'deleted staff gone');
      });
    },
  },
  {
    name: 'counts failed PIN attempts atomically and keeps lockouts across restarts and pulls',
    async run(make, newId) {
      await withStore(make, async (first, h) => {
        const user = newId();
        await first.reference.applyPull([staffChange(user, 'Zoe', 'cashier')], 'log:1');
        const lockMs = (failures: number) => (failures >= 3 ? 60_000 : 0);
        let last = await first.staff.recordFailure(user, '2026-10-20T09:00:00.000Z', lockMs);
        equal([last.failures, last.locked_until], [1, null], 'first failure');
        await first.staff.recordFailure(user, '2026-10-20T09:00:01.000Z', lockMs);
        last = await first.staff.recordFailure(user, '2026-10-20T09:00:02.000Z', lockMs);
        equal([last.failures, last.locked_until], [3, '2026-10-20T09:01:02.000Z'], 'locked after the third');
        await first.close();

        const store = await h.open();
        await store.migrate();
        await store.reference.applyPull([staffChange(user, 'Zoe', 'cashier', { version: 2 })], 'log:2');
        equal(await store.staff.attempts(user), last, 'survives a restart and a pull');
        await store.staff.clearFailures(user);
        equal(await store.staff.attempts(user), null, 'cleared on success');
        equal((await store.staff.recordFailure(user, '2026-10-20T10:00:00.000Z', lockMs)).failures, 1, 'counting starts again');
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
