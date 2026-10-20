/**
 * Storage driver contract: a small transactional document store with
 * secondary indexes. All business logic (local-store.ts) is written once
 * against this interface; each platform supplies a thin driver:
 *
 *   memory-driver.ts    tests and the reference behaviour
 *   sqlite-driver.ts    native (expo-sqlite) and Node (node:sqlite) via SqlDatabase
 *   indexeddb-driver.ts web
 *
 * Every driver must pass src/storage/contract.ts unchanged.
 */

export type Row = Record<string, unknown>;

/** Index key parts. Booleans, null and undefined are not indexable (IndexedDB rules apply everywhere). */
export type IndexValue = string | number;

export interface IndexDef {
  name: string;
  /** Row fields that make up the index key, in order. A row missing any of them is not in the index. */
  fields: string[];
  unique?: boolean;
}

export interface StoreDef {
  name: string;
  /** Field holding the string primary key. */
  key: string;
  indexes: IndexDef[];
}

export type MigrationStep =
  | { op: 'createStore'; store: StoreDef }
  | { op: 'createIndex'; store: string; index: IndexDef }
  | { op: 'deleteIndex'; store: string; name: string }
  /** Rewrites every row; return null to delete the row. Must be pure and synchronous. */
  | { op: 'transform'; store: string; fn: (row: Row) => Row | null };

export interface Migration {
  version: number;
  name: string;
  steps: MigrationStep[];
}

export interface MigrationReport {
  from: number;
  to: number;
  applied: { version: number; name: string }[];
}

/**
 * Rows whose first `eq.length` index fields equal `eq`, optionally bounded on
 * the next field, ordered by the full index key and then the primary key.
 */
export interface IndexQuery {
  index: string;
  eq?: IndexValue[];
  gte?: IndexValue;
  lte?: IndexValue;
  limit?: number;
  reverse?: boolean;
}

/**
 * Operations inside one atomic transaction. Callbacks must only await these
 * operations (no network, timers or crypto.subtle): IndexedDB commits a
 * transaction as soon as it has no pending requests.
 */
export interface Tx {
  /** The type parameter is the caller's assertion about the stored shape; nothing is validated. */
  get<T extends object = Row>(store: string, key: string): Promise<T | null>;
  /** Fails with StorageError('duplicate_key') if the key exists. */
  insert(store: string, row: object): Promise<void>;
  /** Insert or replace by primary key. */
  put(store: string, row: object): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  query<T extends object = Row>(store: string, query: IndexQuery): Promise<T[]>;
  count(store: string, query: IndexQuery): Promise<number>;
}

/** What drivers implement internally: plain rows in and out. */
export interface RowTx {
  get(store: string, key: string): Promise<Row | null>;
  insert(store: string, row: Row): Promise<void>;
  put(store: string, row: Row): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  query(store: string, query: IndexQuery): Promise<Row[]>;
  count(store: string, query: IndexQuery): Promise<number>;
}

/** Rows are stored and returned as plain objects; typed access is the caller's responsibility. */
export function typedTx(tx: RowTx): Tx {
  return tx as unknown as Tx;
}

export interface StorageHealth {
  /** Native: always true. Web: whether the browser granted persistent storage. */
  persistent: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

export interface StorageDriver {
  readonly backend: 'expo-sqlite' | 'sqlite' | 'indexeddb' | 'memory';
  /** Opens the database and applies pending migrations, each atomically. */
  open(migrations: Migration[]): Promise<MigrationReport>;
  transaction<T>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<T>): Promise<T>;
  health(): Promise<StorageHealth>;
  close(): Promise<void>;
}

export class StorageError extends Error {
  override readonly name = 'StorageError';
  constructor(
    readonly code: 'duplicate_key' | 'constraint' | 'not_open' | 'bad_schema' | 'blocked',
    message: string,
  ) {
    super(message);
  }
}

// ── Shared helpers for drivers ────────────────────────────────────────────

const NAME = /^[a-z][a-z0-9_]*$/;

export function assertName(name: string): void {
  if (!NAME.test(name)) throw new StorageError('bad_schema', `Invalid store or index name "${name}"`);
}

/** Final schema after applying every migration, used by drivers to plan queries. */
export function foldSchema(migrations: Migration[]): Map<string, StoreDef> {
  const versions = migrations.map((m) => m.version);
  versions.forEach((v, i) => {
    if (!Number.isInteger(v) || v < 1 || (i > 0 && v <= versions[i - 1]!)) {
      throw new StorageError('bad_schema', 'Migration versions must be positive and strictly increasing');
    }
  });
  const stores = new Map<string, StoreDef>();
  for (const m of migrations) {
    for (const step of m.steps) {
      switch (step.op) {
        case 'createStore':
          assertName(step.store.name);
          step.store.indexes.forEach((ix) => assertName(ix.name));
          if (stores.has(step.store.name)) throw new StorageError('bad_schema', `Store ${step.store.name} exists`);
          stores.set(step.store.name, { ...step.store, indexes: [...step.store.indexes] });
          break;
        case 'createIndex': {
          assertName(step.index.name);
          const s = requireStore(stores, step.store);
          if (s.indexes.some((i) => i.name === step.index.name)) {
            throw new StorageError('bad_schema', `Index ${step.index.name} exists on ${step.store}`);
          }
          s.indexes.push(step.index);
          break;
        }
        case 'deleteIndex': {
          const s = requireStore(stores, step.store);
          s.indexes = s.indexes.filter((i) => i.name !== step.name);
          break;
        }
        case 'transform':
          requireStore(stores, step.store);
          break;
      }
    }
  }
  return stores;
}

export function requireStore(stores: Map<string, StoreDef>, name: string): StoreDef {
  const s = stores.get(name);
  if (!s) throw new StorageError('bad_schema', `Unknown store "${name}"`);
  return s;
}

export function requireIndex(store: StoreDef, name: string): IndexDef {
  const ix = store.indexes.find((i) => i.name === name);
  if (!ix) throw new StorageError('bad_schema', `Unknown index "${name}" on ${store.name}`);
  return ix;
}

export function isIndexValue(v: unknown): v is IndexValue {
  return typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
}

/** Index key for a row, or null when the row is not part of the index. */
export function indexKey(row: Row, index: IndexDef): IndexValue[] | null {
  const key: IndexValue[] = [];
  for (const field of index.fields) {
    const v = row[field];
    if (!isIndexValue(v)) return null;
    key.push(v);
  }
  return key;
}

export function primaryKey(row: Row, store: StoreDef): string {
  const k = row[store.key];
  if (typeof k !== 'string' || k.length === 0) {
    throw new StorageError('bad_schema', `Row in ${store.name} needs a non-empty string "${store.key}"`);
  }
  return k;
}

/** IndexedDB key order: numbers before strings; strings by UTF-16 code unit. */
export function compareValues(a: IndexValue, b: IndexValue): number {
  if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareKeys(a: IndexValue[], b: IndexValue[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = compareValues(a[i]!, b[i]!);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

/** Whether an index key satisfies the query's equality prefix and range. */
export function matchesQuery(key: IndexValue[], q: IndexQuery): boolean {
  const eq = q.eq ?? [];
  for (let i = 0; i < eq.length; i++) if (compareValues(key[i]!, eq[i]!) !== 0) return false;
  const next = key[eq.length];
  if (q.gte !== undefined && (next === undefined || compareValues(next, q.gte) < 0)) return false;
  if (q.lte !== undefined && (next === undefined || compareValues(next, q.lte) > 0)) return false;
  return true;
}

export function validateQuery(index: IndexDef, q: IndexQuery): void {
  const eq = q.eq ?? [];
  if (eq.length > index.fields.length) throw new StorageError('bad_schema', `Too many eq values for ${index.name}`);
  if ((q.gte !== undefined || q.lte !== undefined) && eq.length >= index.fields.length) {
    throw new StorageError('bad_schema', `No field left to range over in ${index.name}`);
  }
  for (const v of [...eq, q.gte, q.lte]) {
    if (v !== undefined && !isIndexValue(v)) throw new StorageError('bad_schema', 'Query values must be strings or numbers');
  }
}

/** Serialises async work: one transaction at a time per database. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
