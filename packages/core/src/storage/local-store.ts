import { sha256 } from '@noble/hashes/sha2.js';
import {
  ENTITY_DATA_SCHEMAS,
  type BranchInfo,
  type BusinessInfo,
  type CategoryInfo,
  type CustomerInfo,
  type ExchangeRateInfo,
  type PaymentMethodInfo,
  type RegisterInfo,
  type StaffInfo,
} from '../catalogue/contracts';
import { utf8Encode } from '../encoding/base64url';
import { cumulativeRefund, RefundError, refundableLines } from '../sales/refund';
import {
  syncEventSchema,
  type CashMovementPayload,
  type RefundIssuedPayload,
  type SaleCompletedPayload,
  type SyncEvent,
} from '../sync/events';
import { nextSyncState, type LocalSyncState, type SyncOutcome } from '../sync/state';
import { StorageError, type Migration, type MigrationReport, type StorageDriver, type Tx } from './driver';
import type {
  AckInput,
  CatalogueProduct,
  CatalogueSnapshot,
  CommitSaleOptions,
  LocalSale,
  LocalStore,
  OutboxEntry,
  PinAttempts,
  PullChange,
  RecoveryBundle,
  SaleCompletedEvent,
  ShiftRecord,
  UnsequencedCashMovementEvent,
  UnsequencedRefundEvent,
  UnsequencedShiftClosedEvent,
  UnsequencedShiftOpenedEvent,
  StorageInfo,
  UnsequencedSaleEvent,
} from './ports';
import { ShiftStateError } from './ports';
import { MIGRATIONS } from './schema';
import type { OpenOrder } from '../sales/orders';

export class PullContractError extends Error {
  override readonly name = 'PullContractError';
}

export class DuplicateSaleError extends Error {
  override readonly name = 'DuplicateSaleError';
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const ms = (iso: string | null) => (iso === null ? null : Date.parse(iso));

/** Stored outbox row: the public entry plus index helpers. */
type OutboxRow = OutboxEntry & { open: 0 | 1; next_attempt_ms: number | null };
type SaleRow = LocalSale & { sale_id: string; completed_at_ms: number; shift_id?: string };
type RefundRow = {
  refund_id: string;
  original_sale_id: string;
  shift_id?: string;
  refunded_at_ms: number;
  refund: RefundIssuedPayload;
  event_id: string;
  device_sequence: number;
  sync_state: LocalSyncState;
};
type ShiftRow = ShiftRecord & { opened_at_ms: number; open: 0 | 1 };
type RefundEvent = Extract<SyncEvent, { event_type: 'refund.issued' }>;
type ShiftOpenedEvent = Extract<SyncEvent, { event_type: 'shift.opened' }>;
type ShiftClosedEvent = Extract<SyncEvent, { event_type: 'shift.closed' }>;
type CashMovementEvent = Extract<SyncEvent, { event_type: 'cash.movement' }>;

const toShift = ({ opened_at_ms: _ms, open: _open, ...shift }: ShiftRow): ShiftRecord => shift;
type ProductRow = CatalogueProduct & { name_lc: string; category_k: string };
type CustomerRow = CustomerInfo & { name_lc: string; phone_k: string };

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
type StaffRow = StaffInfo & { name_lc: string };

const OPEN_STATES: LocalSyncState[] = ['local', 'pending'];

function toEntry(row: OutboxRow): OutboxEntry {
  const { open: _open, next_attempt_ms: _next, ...entry } = row;
  return entry;
}

function toProduct(row: ProductRow): CatalogueProduct {
  const { name_lc: _lc, category_k: _ck, ...product } = row;
  return product;
}

function toCustomer(row: CustomerRow): CustomerInfo {
  const { name_lc: _lc, phone_k: _pk, ...customer } = row;
  return customer;
}

function toStaff(row: StaffRow): StaffInfo {
  const { name_lc: _lc, ...staff } = row;
  return staff;
}

function toSale(r: SaleRow): LocalSale {
  return { sale: r.sale, event_id: r.event_id, device_sequence: r.device_sequence, sync_state: r.sync_state };
}

export interface LocalStoreOptions {
  migrations?: Migration[];
  now?: () => Date;
}

export function createLocalStore(driver: StorageDriver, options: LocalStoreOptions = {}): LocalStore {
  const migrations = options.migrations ?? MIGRATIONS;
  const now = options.now ?? (() => new Date());
  let schemaVersion = 0;

  const rw = <T>(fn: (tx: Tx) => Promise<T>) => driver.transaction('readwrite', fn);
  const ro = <T>(fn: (tx: Tx) => Promise<T>) => driver.transaction('readonly', fn);

  async function writeProducts(tx: Tx, products: CatalogueProduct[], removedIds: string[]): Promise<void> {
    for (const id of [...removedIds, ...products.map((p) => p.product_id)]) {
      for (const b of await tx.query('barcodes', { index: 'by_product', eq: [id] })) {
        await tx.delete('barcodes', b.barcode as string);
      }
    }
    for (const id of removedIds) await tx.delete('products', id);
    for (const p of products) {
      const row: ProductRow = { ...p, name_lc: p.name.toLocaleLowerCase(), category_k: p.category_id ?? '' };
      await tx.put('products', row);
      // A barcode moved to another product simply points at the new one.
      for (const barcode of p.barcodes) await tx.put('barcodes', { barcode, product_id: p.product_id });
    }
  }

  /** "log:42", "snap:42:<id>" or "snapc:42:<id>" → 42: the server change-log position this catalogue reflects. */
  function cursorVersion(cursor: string): number {
    const m = /^(?:log|snapc?):(\d+)/.exec(cursor);
    return m ? Number(m[1]) : 0;
  }

  /**
   * The one way an event enters the outbox. Inside the caller's transaction it
   * allocates the next device_sequence, validates the complete event, lets
   * `write` store the event's own records, and queues the exact bytes. Only
   * synchronous work and store operations happen here (IndexedDB-safe).
   */
  async function appendEvent<E extends SyncEvent>(
    tx: Tx,
    input: Omit<E, 'device_sequence'>,
    createdAt: string,
    payloadFor: ((sequence: number) => E['payload']) | null,
    write: (event: E) => Promise<void>,
  ): Promise<OutboxEntry> {
    const sequence = (await readSequence(tx)) + 1;
    const candidate = { ...input, ...(payloadFor ? { payload: payloadFor(sequence) } : {}), device_sequence: sequence };
    const event = syncEventSchema.parse(candidate) as E;
    await write(event);
    const body = JSON.stringify(event);
    const entry: OutboxRow = {
      event_id: event.event_id,
      device_sequence: sequence,
      event_type: event.event_type,
      aggregate_id: event.aggregate_id,
      body,
      body_sha256: hex(sha256(utf8Encode(body))),
      state: 'local',
      open: 1,
      attempts: 0,
      next_attempt_at: null,
      next_attempt_ms: null,
      last_error: null,
      last_result: null,
      conflict_id: null,
      created_at: createdAt,
      acknowledged_at: null,
    };
    await tx.insert('outbox', entry);
    await tx.put('meta', { k: 'device_sequence', v: sequence });
    return toEntry(entry);
  }

  async function readSequence(tx: Tx): Promise<number> {
    return Number((await tx.get('meta', 'device_sequence'))?.v ?? 0);
  }

  /**
   * Receipt numbers run without gaps per kind (sales, refunds), separately from
   * device_sequence, which shifts and cash movements also consume. A till that
   * has no counter yet (new, or upgraded from before the counters) starts after
   * the receipts it already holds; before shifts and refunds existed sales were
   * numbered 1..n, so an upgraded till never repeats a number.
   */
  async function receiptPayload<P extends { receipt_number: string }>(
    tx: Tx,
    kind: 'sale' | 'refund',
    payload: P,
    format: ((n: number) => string) | undefined,
  ): Promise<((sequence: number) => P) | null> {
    if (!format) return null;
    const key = `receipt_seq:${kind}`;
    const stored = (await tx.get('meta', key))?.v;
    const held = kind === 'sale' ? () => tx.count('sales', { index: 'by_completed' }) : () => tx.count('refunds', { index: 'by_original' });
    const n = Number(stored ?? (await held())) + 1;
    await tx.put('meta', { k: key, v: n });
    return () => ({ ...payload, receipt_number: format(n) });
  }

  async function transition(tx: Tx, row: OutboxRow, outcome: SyncOutcome, patch: Partial<OutboxRow>): Promise<OutboxRow> {
    const state = nextSyncState(row.state, outcome);
    const next: OutboxRow = { ...row, ...patch, state, open: OPEN_STATES.includes(state) ? 1 : 0 };
    await tx.put('outbox', next);
    // Records that show a sync badge follow their event's state.
    const store = ({ 'sale.completed': 'sales', 'refund.issued': 'refunds' } as Record<string, string>)[row.event_type];
    if (store && state !== row.state) {
      const record = await tx.get(store, row.aggregate_id);
      if (record) await tx.put(store, { ...record, sync_state: state });
    }
    return next;
  }

  return {
    async migrate(): Promise<MigrationReport> {
      const report = await driver.open(migrations);
      schemaVersion = report.to;
      return report;
    },

    async info(): Promise<StorageInfo> {
      return { backend: driver.backend, schemaVersion, ...(await driver.health()) };
    },

    catalogue: {
      applyChanges: (products, removedIds, snapshot) =>
        rw(async (tx) => {
          await writeProducts(tx, products, removedIds);
          await tx.put('meta', { k: 'catalogue_snapshot', v: snapshot });
        }),

      findByBarcode: (barcode) =>
        ro(async (tx) => {
          const link = await tx.get('barcodes', barcode);
          const product = link ? await tx.get<ProductRow>('products', link.product_id as string) : null;
          return product ? toProduct(product) : null;
        }),

      search: (prefix, limit) =>
        ro(async (tx) => {
          const q = prefix.toLocaleLowerCase();
          const rows = await tx.query<ProductRow>('products', { index: 'by_name', gte: q, lte: `${q}￿`, limit: limit * 4 });
          const products = rows.map(toProduct);
          return [...products.filter((p) => p.active), ...products.filter((p) => !p.active)].slice(0, limit);
        }),

      snapshot: () => ro(async (tx) => ((await tx.get('meta', 'catalogue_snapshot'))?.v as CatalogueSnapshot) ?? null),

      categories: () => ro(async (tx) => (await tx.query<CategoryInfo>('categories', { index: 'by_position' })).filter((c) => c.active)),

      inCategory: (categoryId, limit) =>
        ro(async (tx) =>
          (await tx.query<ProductRow>('products', { index: 'by_category', eq: [categoryId], limit: limit * 2 }))
            .filter((p) => p.active)
            .slice(0, limit)
            .map(toProduct),
        ),
    },

    orders: {
      list: () => ro(async (tx) => (await tx.query<OpenOrder>('orders', { index: 'by_number' })).sort((a, b) => a.opened_at.localeCompare(b.opened_at))),
      get: (orderId) => ro(async (tx) => (await tx.get<OpenOrder>('orders', orderId)) ?? null),
      save: (order) =>
        rw(async (tx) => {
          await tx.put('orders', order);
        }),
      remove: (orderId) =>
        rw(async (tx) => {
          await tx.delete('orders', orderId);
        }),
      nextNumber: (day) =>
        rw(async (tx) => {
          const key = `order_seq:${day}`;
          const n = Number((await tx.get('meta', key))?.v ?? 0) + 1;
          await tx.put('meta', { k: key, v: n });
          return n;
        }),
    },

    customers: {
      search: (text, limit) =>
        ro(async (tx) => {
          const q = text.trim().toLocaleLowerCase();
          // Leading zeros dropped so a local number (077…) finds one stored internationally (+263 77…).
          const phone = digits(q).replace(/^0+/, '');
          const rows =
            phone.length >= 3 && digits(q).length === q.replace(/[\s()+-]/g, '').length
              ? // Phone digits can match anywhere ("771234" in "263771234567"), so scan the phone index.
                (await tx.query<CustomerRow>('customers', { index: 'by_phone', gte: '0', lte: '9\uffff' })).filter((c) => c.phone_k.includes(phone))
              : await tx.query<CustomerRow>('customers', { index: 'by_name', gte: q, lte: `${q}\uffff`, limit: limit * 2 });
          return rows.filter((c) => c.active).slice(0, limit).map(toCustomer);
        }),
      get: (id) =>
        ro(async (tx) => {
          const row = await tx.get<CustomerRow>('customers', id);
          return row ? toCustomer(row) : null;
        }),
    },

    sales: {
      async commitSale(input: UnsequencedSaleEvent, options: CommitSaleOptions = {}): Promise<OutboxEntry> {
        const createdAt = now().toISOString();
        try {
          return await rw(async (tx) =>
            appendEvent<SaleCompletedEvent>(
              tx,
              input,
              createdAt,
              await receiptPayload(tx, 'sale', input.payload, options.receiptNumber),
              async (event) => {
                const payload = event.payload;
                await tx.insert('sales', {
                  sale_id: payload.sale_id,
                  completed_at_ms: Date.parse(payload.completed_at),
                  ...(payload.shift_id ? { shift_id: payload.shift_id } : {}),
                  sale: payload,
                  event_id: event.event_id,
                  device_sequence: event.device_sequence,
                  sync_state: 'local',
                } satisfies SaleRow);
                for (const m of payload.stock_movements) {
                  await tx.insert('stock_movements', { ...m, sale_id: payload.sale_id, device_sequence: event.device_sequence });
                }
              },
            ),
          );
        } catch (e) {
          if (e instanceof StorageError && e.code === 'duplicate_key') {
            throw new DuplicateSaleError(`Sale ${input.payload.sale_id} or one of its records already exists`);
          }
          throw e;
        }
      },

      get: (saleId) =>
        ro(async (tx) => {
          const row = await tx.get<SaleRow>('sales', saleId);
          return row ? toSale(row) : null;
        }),

      listRecent: (limit) => ro(async (tx) => (await tx.query<SaleRow>('sales', { index: 'by_completed', reverse: true, limit })).map(toSale)),
    },

    outbox: {
      due: (nowIso, limit) =>
        ro(async (tx) => {
          const nowMs = Date.parse(nowIso);
          const open = await tx.query<OutboxRow>('outbox', { index: 'by_open', eq: [1], limit });
          const due: OutboxEntry[] = [];
          for (const row of open) {
            if (row.next_attempt_ms !== null && row.next_attempt_ms > nowMs) break; // keep order
            due.push(toEntry(row));
          }
          return due;
        }),

      get: (eventId) =>
        ro(async (tx) => {
          const row = await tx.get<OutboxRow>('outbox', eventId);
          return row ? toEntry(row) : null;
        }),

      // If the app dies mid-request, the entry stays due and is resent with the same bytes.
      markAttempt: (eventIds, _at) =>
        rw(async (tx) => {
          for (const id of eventIds) {
            const row = await tx.get<OutboxRow>('outbox', id);
            if (row && row.open) await transition(tx, row, { kind: 'attempt_started' }, { attempts: row.attempts + 1 });
          }
        }),

      markTransportFailure: (eventIds, error, nextAttemptAt) =>
        rw(async (tx) => {
          for (const id of eventIds) {
            const row = await tx.get<OutboxRow>('outbox', id);
            if (row && row.open) {
              await transition(tx, row, { kind: 'transport_failed' }, {
                last_error: error,
                next_attempt_at: nextAttemptAt,
                next_attempt_ms: ms(nextAttemptAt),
              });
            }
          }
        }),

      applyAcknowledgements: (acks: AckInput[], at) =>
        rw(async (tx) => {
          let applied = 0;
          const unknown: string[] = [];
          for (const ack of acks) {
            const row = await tx.get<OutboxRow>('outbox', ack.event_id);
            if (!row) {
              unknown.push(ack.event_id);
              continue;
            }
            // A repeated "accepted"/"duplicate" for a synced entry is harmless; anything else
            // arriving after a final answer is ignored rather than reopening the entry.
            if (!row.open && !(row.state === 'synced' && (ack.result === 'accepted' || ack.result === 'duplicate'))) continue;
            await transition(tx, row, { kind: 'acknowledged', result: ack.result }, {
              last_result: ack.result,
              conflict_id: ack.conflict_id ?? row.conflict_id,
              last_error: ack.error ?? null,
              acknowledged_at: row.acknowledged_at ?? at,
              next_attempt_at: null,
              next_attempt_ms: null,
            });
            applied++;
          }
          return { applied, unknown };
        }),

      countByState: () =>
        ro(async (tx) => {
          const states: LocalSyncState[] = ['local', 'pending', 'synced', 'needs_review'];
          const counts = await Promise.all(states.map((s) => tx.count('outbox', { index: 'by_state', eq: [s] })));
          return Object.fromEntries(states.map((s, i) => [s, counts[i]!])) as Record<LocalSyncState, number>;
        }),

      lastSequence: () => ro(readSequence),
    },

    reference: {
      async applyPull(changes: PullChange[], nextCursor: string) {
        // Validate the whole page before touching storage (outside the transaction).
        const parsed = changes.map((c, i) => {
          if (c.op === 'delete') return { ...c, data: null };
          const result = ENTITY_DATA_SCHEMAS[c.entity].safeParse(c.data);
          if (!result.success) throw new PullContractError(`Change ${i} (${c.entity} ${c.id}) is malformed: ${result.error.message}`);
          return { ...c, data: result.data };
        });

        return rw(async (tx) => {
          const products = new Map<string, CatalogueProduct>();
          const removed = new Set<string>();
          for (const c of parsed) {
            switch (c.entity) {
              case 'product':
                // Later changes in a page win over earlier ones for the same product.
                if (c.op === 'delete') {
                  products.delete(c.id);
                  removed.add(c.id);
                } else {
                  removed.delete(c.id);
                  products.set(c.id, c.data as CatalogueProduct);
                }
                break;
              case 'payment_method':
                if (c.op === 'delete') await tx.delete('payment_methods', c.id);
                else await tx.put('payment_methods', c.data as PaymentMethodInfo);
                break;
              case 'exchange_rate':
                if (c.op === 'delete') await tx.delete('exchange_rates', c.id);
                else await tx.put('exchange_rates', c.data as ExchangeRateInfo);
                break;
              case 'category':
                if (c.op === 'delete') await tx.delete('categories', c.id);
                else await tx.put('categories', c.data as CategoryInfo);
                break;
              case 'customer':
                if (c.op === 'delete') await tx.delete('customers', c.id);
                else {
                  const customer = c.data as CustomerInfo;
                  await tx.put('customers', { ...customer, name_lc: customer.name.toLocaleLowerCase(), phone_k: digits(customer.phone) } satisfies CustomerRow);
                }
                break;
              case 'staff':
                if (c.op === 'delete') await tx.delete('staff', c.id);
                else await tx.put('staff', { ...(c.data as StaffInfo), name_lc: (c.data as StaffInfo).name.toLocaleLowerCase() } satisfies StaffRow);
                break;
              default: {
                const k = `${c.entity}:${c.id}`;
                if (c.op === 'delete') await tx.delete('reference', k);
                else await tx.put('reference', { k, entity: c.entity, data: c.data });
              }
            }
          }
          await writeProducts(tx, [...products.values()], [...removed]);
          const previous = Number((await tx.get('meta', 'catalogue_version'))?.v ?? 0);
          await tx.put('meta', { k: 'pull_cursor', v: nextCursor });
          await tx.put('meta', { k: 'catalogue_version', v: Math.max(previous, cursorVersion(nextCursor)) });
          return { applied: parsed.length };
        });
      },

      cursor: () => ro(async (tx) => ((await tx.get('meta', 'pull_cursor'))?.v as string | undefined) ?? ''),
      catalogueVersion: () => ro(async (tx) => Number((await tx.get('meta', 'catalogue_version'))?.v ?? 0)),
      business: () =>
        ro(async (tx) => ((await tx.query('reference', { index: 'by_entity', eq: ['business'], limit: 1 }))[0]?.data as BusinessInfo | undefined) ?? null),
      branch: (id) => ro(async (tx) => ((await tx.get('reference', `branch:${id}`))?.data as BranchInfo | undefined) ?? null),
      register: (id) => ro(async (tx) => ((await tx.get('reference', `register:${id}`))?.data as RegisterInfo | undefined) ?? null),
      paymentMethods: () =>
        ro(async (tx) => (await tx.query<PaymentMethodInfo>('payment_methods', { index: 'by_position' })).filter((m) => m.active)),
      exchangeRate: (base, quote) =>
        ro(
          async (tx) =>
            (await tx.query<ExchangeRateInfo>('exchange_rates', { index: 'by_pair', eq: [base, quote], reverse: true, limit: 1 }))[0] ?? null,
        ),
    },

    refunds: {
      commitRefund: (input: UnsequencedRefundEvent, options: CommitSaleOptions = {}) => {
        const createdAt = now().toISOString();
        return rw(async (tx) => {
          const sale = await tx.get<SaleRow>('sales', input.payload.original_sale_id);
          if (!sale) throw new RefundError('unknown_line', 'The original sale is not on this till.');
          const previous = (await tx.query<RefundRow>('refunds', { index: 'by_original', eq: [sale.sale_id] })).map((r) => r.refund);
          // Re-check against the current state: a stale screen must not refund twice.
          const left = refundableLines(sale.sale, previous);
          for (const line of input.payload.lines) {
            const entry = left.find((l) => l.line.line_id === line.original_line_id);
            if (!entry) throw new RefundError('unknown_line', 'That item is not on the original sale.');
            if (line.quantity_milli > entry.refundableMilli) {
              throw new RefundError('too_much', `${entry.line.name} has less left to refund than requested.`);
            }
            const after = entry.refundedMilli + line.quantity_milli;
            const expected =
              cumulativeRefund(entry.line.line_total_minor, entry.line.quantity_milli, after, sale.sale.rounding) -
              cumulativeRefund(entry.line.line_total_minor, entry.line.quantity_milli, entry.refundedMilli, sale.sale.rounding);
            if (line.amount_minor !== expected) throw new RefundError('too_much', `Refund for ${entry.line.name} should be ${expected}.`);
          }
          return appendEvent<RefundEvent>(
            tx,
            input,
            createdAt,
            await receiptPayload(tx, 'refund', input.payload, options.receiptNumber),
            async (event) => {
              const r = event.payload;
              await tx.insert('refunds', {
                refund_id: r.refund_id,
                original_sale_id: r.original_sale_id,
                ...(r.shift_id ? { shift_id: r.shift_id } : {}),
                refunded_at_ms: Date.parse(r.refunded_at),
                refund: r,
                event_id: event.event_id,
                device_sequence: event.device_sequence,
                sync_state: 'local',
              } satisfies RefundRow);
              for (const m of r.stock_movements) {
                await tx.insert('stock_movements', { ...m, refund_id: r.refund_id, device_sequence: event.device_sequence });
              }
            },
          );
        });
      },

      forSale: (saleId) =>
        ro(async (tx) => (await tx.query<RefundRow>('refunds', { index: 'by_original', eq: [saleId] })).map((r) => r.refund)),
    },

    shifts: {
      current: () =>
        ro(async (tx) => {
          const row = (await tx.query<ShiftRow>('shifts', { index: 'by_open', eq: [1], limit: 1 }))[0];
          return row ? toShift(row) : null;
        }),

      get: (shiftId) =>
        ro(async (tx) => {
          const row = await tx.get<ShiftRow>('shifts', shiftId);
          return row ? toShift(row) : null;
        }),

      recent: (limit) => ro(async (tx) => (await tx.query<ShiftRow>('shifts', { index: 'by_opened', reverse: true, limit })).map(toShift)),

      open: (input: UnsequencedShiftOpenedEvent) =>
        rw(async (tx) => {
          if ((await tx.count('shifts', { index: 'by_open', eq: [1] })) > 0) throw new ShiftStateError('A shift is already open on this till.');
          return appendEvent<ShiftOpenedEvent>(tx, input, now().toISOString(), null, async (event) => {
            const p = event.payload;
            await tx.insert('shifts', { ...p, opened_at_ms: Date.parse(p.opened_at), open: 1, closed: null } satisfies ShiftRow);
          });
        }),

      close: (input: UnsequencedShiftClosedEvent) =>
        rw(async (tx) => {
          const shift = await tx.get<ShiftRow>('shifts', input.payload.shift_id);
          if (!shift || !shift.open) throw new ShiftStateError('That shift is not open.');
          return appendEvent<ShiftClosedEvent>(tx, input, now().toISOString(), null, async (event) => {
            const { closed_at, expected_cash, counted_cash, note } = event.payload;
            await tx.put('shifts', { ...shift, open: 0, closed: { closed_at, expected_cash, counted_cash, ...(note ? { note } : {}) } } satisfies ShiftRow);
          });
        }),

      recordCashMovement: (input: UnsequencedCashMovementEvent) =>
        rw(async (tx) => {
          const shift = await tx.get<ShiftRow>('shifts', input.payload.shift_id);
          if (!shift || !shift.open) throw new ShiftStateError('Cash can only be moved during an open shift.');
          return appendEvent<CashMovementEvent>(tx, input, now().toISOString(), null, async (event) => {
            await tx.insert('cash_movements', { ...event.payload });
          });
        }),

      activity: (shiftId) =>
        ro(async (tx) => ({
          sales: (await tx.query<SaleRow>('sales', { index: 'by_shift', eq: [shiftId] })).map((r) => r.sale as SaleCompletedPayload),
          refunds: (await tx.query<RefundRow>('refunds', { index: 'by_shift', eq: [shiftId] })).map((r) => r.refund),
          movements: await tx.query<CashMovementPayload>('cash_movements', { index: 'by_shift', eq: [shiftId] }),
        })),
    },

    staff: {
      listActive: () => ro(async (tx) => (await tx.query<StaffRow>('staff', { index: 'by_name' })).filter((s) => s.active).map(toStaff)),
      get: (userId) =>
        ro(async (tx) => {
          const row = await tx.get<StaffRow>('staff', userId);
          return row ? toStaff(row) : null;
        }),
      attempts: (userId) => ro(async (tx) => (await tx.get<PinAttempts>('pin_attempts', userId)) ?? null),
      recordFailure: (userId, at, lockMs) =>
        rw(async (tx) => {
          const failures = ((await tx.get<PinAttempts>('pin_attempts', userId))?.failures ?? 0) + 1;
          const lock = lockMs(failures);
          const row: PinAttempts = {
            user_id: userId,
            failures,
            last_failure_at: at,
            locked_until: lock > 0 ? new Date(Date.parse(at) + lock).toISOString() : null,
          };
          await tx.put('pin_attempts', row);
          return row;
        }),
      clearFailures: (userId) =>
        rw(async (tx) => {
          await tx.delete('pin_attempts', userId);
        }),
    },

    stock: {
      localDeltaMilli: (productId) =>
        ro(async (tx) => {
          const rows = await tx.query('stock_movements', { index: 'by_product', eq: [productId] });
          return rows.reduce((sum, r) => sum + Number(r.quantity_delta_milli), 0);
        }),
    },

    settings: {
      get: (key) => ro(async (tx) => ((await tx.get('settings', key))?.v as string | undefined) ?? null),
      set: (key, value) =>
        rw(async (tx) => {
          await tx.put('settings', { k: key, v: value });
        }),
    },

    exportRecoveryBundle: () =>
      ro(async (tx): Promise<RecoveryBundle> => {
        const open = await tx.query<OutboxRow>('outbox', { index: 'by_open', eq: [1] });
        const review = await tx.query<OutboxRow>('outbox', { index: 'by_state', eq: ['needs_review'] });
        const entries = [...open, ...review]
          .sort((a, b) => a.device_sequence - b.device_sequence)
          .map(({ event_id, device_sequence, event_type, body, body_sha256, state }) => ({
            event_id,
            device_sequence,
            event_type,
            body,
            body_sha256,
            state,
          }));
        return { format: 'inkypos-recovery/v1', exported_at: now().toISOString(), last_sequence: await readSequence(tx), entries };
      }),

    close: () => driver.close(),
  };
}
