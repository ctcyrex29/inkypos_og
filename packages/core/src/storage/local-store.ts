import { sha256 } from '@noble/hashes/sha2.js';
import { utf8Encode } from '../encoding/base64url';
import { syncEventSchema } from '../sync/events';
import { nextSyncState, type LocalSyncState, type SyncOutcome } from '../sync/state';
import { StorageError, type Migration, type MigrationReport, type StorageDriver, type Tx } from './driver';
import type {
  AckInput,
  CatalogueProduct,
  CatalogueSnapshot,
  LocalSale,
  LocalStore,
  OutboxEntry,
  RecoveryBundle,
  SaleCompletedEvent,
  StorageInfo,
  UnsequencedSaleEvent,
} from './ports';
import { MIGRATIONS } from './schema';

export class DuplicateSaleError extends Error {
  override readonly name = 'DuplicateSaleError';
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const ms = (iso: string | null) => (iso === null ? null : Date.parse(iso));

/** Stored outbox row: the public entry plus index helpers. */
type OutboxRow = OutboxEntry & { open: 0 | 1; next_attempt_ms: number | null };
type SaleRow = LocalSale & { sale_id: string; completed_at_ms: number };
type ProductRow = CatalogueProduct & { name_lc: string };

const OPEN_STATES: LocalSyncState[] = ['local', 'pending'];

function toEntry(row: OutboxRow): OutboxEntry {
  const { open: _open, next_attempt_ms: _next, ...entry } = row;
  return entry;
}

function toProduct(row: ProductRow): CatalogueProduct {
  const { name_lc: _lc, ...product } = row;
  return product;
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

  async function readSequence(tx: Tx): Promise<number> {
    return Number((await tx.get('meta', 'device_sequence'))?.v ?? 0);
  }

  async function transition(tx: Tx, row: OutboxRow, outcome: SyncOutcome, patch: Partial<OutboxRow>): Promise<OutboxRow> {
    const state = nextSyncState(row.state, outcome);
    const next: OutboxRow = { ...row, ...patch, state, open: OPEN_STATES.includes(state) ? 1 : 0 };
    await tx.put('outbox', next);
    if (row.event_type === 'sale.completed' && state !== row.state) {
      const sale = await tx.get('sales', row.aggregate_id);
      if (sale) await tx.put('sales', { ...sale, sync_state: state });
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
          for (const id of [...removedIds, ...products.map((p) => p.product_id)]) {
            for (const b of await tx.query('barcodes', { index: 'by_product', eq: [id] })) {
              await tx.delete('barcodes', b.barcode as string);
            }
          }
          for (const id of removedIds) await tx.delete('products', id);
          for (const p of products) {
            const row: ProductRow = { ...p, name_lc: p.name.toLocaleLowerCase() };
            await tx.put('products', row);
            // A barcode moved to another product simply points at the new one.
            for (const barcode of p.barcodes) await tx.put('barcodes', { barcode, product_id: p.product_id });
          }
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
    },

    sales: {
      async commitSale(input: UnsequencedSaleEvent): Promise<OutboxEntry> {
        const createdAt = now().toISOString();
        try {
          return await rw(async (tx) => {
            // Everything below is synchronous CPU work or store operations (IndexedDB-safe).
            const sequence = (await readSequence(tx)) + 1;
            const event = syncEventSchema.parse({ ...input, device_sequence: sequence }) as SaleCompletedEvent;
            const body = JSON.stringify(event);
            const payload = event.payload;

            await tx.insert('sales', {
              sale_id: payload.sale_id,
              completed_at_ms: Date.parse(payload.completed_at),
              sale: payload,
              event_id: event.event_id,
              device_sequence: sequence,
              sync_state: 'local',
            } satisfies SaleRow);
            for (const m of payload.stock_movements) {
              await tx.insert('stock_movements', { ...m, sale_id: payload.sale_id, device_sequence: sequence });
            }
            const entry: OutboxRow = {
              event_id: event.event_id,
              device_sequence: sequence,
              event_type: event.event_type,
              aggregate_id: payload.sale_id,
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
          });
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
