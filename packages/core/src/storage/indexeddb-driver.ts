import {
  foldSchema,
  primaryKey,
  requireIndex,
  requireStore,
  StorageError,
  validateQuery,
  type IndexQuery,
  type Migration,
  type MigrationReport,
  type Row,
  type StorageDriver,
  type StorageHealth,
  type StoreDef,
  type RowTx,
  type Tx,
  typedTx,
} from './driver';

const MIGRATIONS_STORE = '_migrations';

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new StorageError('constraint', 'Transaction aborted'));
  });
}

/** Index keys are always arrays, so ranges work the same for single- and multi-field indexes. */
function keyRange(q: IndexQuery): IDBKeyRange | undefined {
  const eq = q.eq ?? [];
  if (eq.length === 0 && q.gte === undefined && q.lte === undefined) return undefined;
  const lower = q.gte !== undefined ? [...eq, q.gte] : [...eq];
  // [] sorts after every number and string, so it closes the range over any trailing fields.
  const upper = q.lte !== undefined ? [...eq, q.lte, []] : [...eq, []];
  return IDBKeyRange.bound(lower, upper);
}

function translate(e: unknown, store: string): unknown {
  const name = (e as DOMException)?.name;
  return name === 'ConstraintError' ? new StorageError('constraint', `Constraint failed in ${store}`) : e;
}

/**
 * Web driver. Each StorageDriver transaction is one IndexedDB readwrite
 * transaction over every store, so a sale and its outbox entry commit together
 * or not at all. Migrations run inside the versionchange transaction.
 */
export class IndexedDbDriver implements StorageDriver {
  readonly backend = 'indexeddb' as const;
  private db: IDBDatabase | null = null;
  private schema: Map<string, StoreDef> | null = null;

  constructor(
    private readonly name: string,
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly storage: StorageManager | undefined = (globalThis as { navigator?: Navigator }).navigator?.storage,
  ) {}

  /**
   * Which migrations this database has recorded. IndexedDB's own version
   * number only says "schema changed N times"; the _migrations store says
   * which migrations ran, so one added between two applied ones still runs.
   */
  private async recorded(): Promise<{ db: IDBDatabase; done: Set<number> }> {
    const request = this.factory.open(this.name);
    request.onupgradeneeded = () => {
      // Brand-new database: only the bookkeeping store for now.
      request.result.createObjectStore(MIGRATIONS_STORE, { keyPath: 'version' });
    };
    const db = await req(request);
    if (!db.objectStoreNames.contains(MIGRATIONS_STORE)) return { db, done: new Set() };
    const keys = await req(db.transaction(MIGRATIONS_STORE, 'readonly').objectStore(MIGRATIONS_STORE).getAllKeys());
    return { db, done: new Set(keys.map(Number)) };
  }

  async open(migrations: Migration[]): Promise<MigrationReport> {
    const schema = foldSchema(migrations);
    const applied: { version: number; name: string }[] = [];
    let upgradeFailure: unknown = null;

    const current = await this.recorded();
    const from = Math.max(0, ...current.done);
    const pending = migrations.filter((m) => !current.done.has(m.version));
    if (pending.length === 0) {
      this.db = current.db;
      this.db.onversionchange = () => this.db?.close();
      this.schema = schema;
      return { from, to: from, applied };
    }
    const nextVersion = current.db.version + 1;
    current.db.close();

    const request = this.factory.open(this.name, nextVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction!;
      if (!db.objectStoreNames.contains(MIGRATIONS_STORE)) db.createObjectStore(MIGRATIONS_STORE, { keyPath: 'version' });

      // Steps run strictly in order; a failure aborts the whole versionchange transaction.
      const run = async () => {
        for (const m of pending) {
          for (const step of m.steps) {
            switch (step.op) {
              case 'createStore': {
                const os = db.createObjectStore(step.store.name, { keyPath: step.store.key });
                for (const ix of step.store.indexes) os.createIndex(ix.name, ix.fields, { unique: !!ix.unique });
                break;
              }
              case 'createIndex':
                tx.objectStore(step.store).createIndex(step.index.name, step.index.fields, { unique: !!step.index.unique });
                break;
              case 'deleteIndex':
                tx.objectStore(step.store).deleteIndex(step.name);
                break;
              case 'transform': {
                const os = tx.objectStore(step.store);
                const rows = await req(os.getAll() as IDBRequest<Row[]>);
                const def = requireStore(schema, step.store);
                for (const row of rows) {
                  const next = step.fn(row);
                  const key = primaryKey(row, def);
                  if (next === null) await req(os.delete(key));
                  else await req(os.put(next));
                }
                break;
              }
            }
          }
          await req(tx.objectStore(MIGRATIONS_STORE).put({ version: m.version, name: m.name, applied_at: new Date().toISOString() }));
          applied.push({ version: m.version, name: m.name });
        }
      };
      run().catch((e) => {
        upgradeFailure = e;
        tx.abort();
      });
    };
    request.onblocked = () => {
      upgradeFailure = new StorageError('blocked', 'Close other InkyPOS tabs to finish updating the local database.');
    };

    try {
      this.db = await req(request);
    } catch (e) {
      throw upgradeFailure ?? e;
    }
    // Another tab upgrading later must not be blocked by us.
    this.db.onversionchange = () => this.db?.close();
    this.schema = schema;
    return { from, to: Math.max(from, ...applied.map((a) => a.version)), applied };
  }

  async transaction<T>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<T>): Promise<T> {
    const db = this.db;
    const schema = this.schema;
    if (!db || !schema) throw new StorageError('not_open', 'Database is not open');
    const names = [...schema.keys()];
    const idbTx = db.transaction(names, mode);
    const completion = done(idbTx);
    completion.catch(() => undefined); // observed below; avoid unhandled rejection on abort
    const os = (store: string) => {
      requireStore(schema, store);
      return idbTx.objectStore(store);
    };

    const tx: RowTx = {
      get: async (store, key) => ((await req(os(store).get(key))) as Row | undefined) ?? null,
      insert: async (store, row) => {
        const def = requireStore(schema, store);
        const key = primaryKey(row, def);
        if ((await req(os(store).count(key))) > 0) throw new StorageError('duplicate_key', `${store} already has ${key}`);
        try {
          await req(os(store).add(row));
        } catch (e) {
          throw translate(e, store);
        }
      },
      put: async (store, row) => {
        primaryKey(row, requireStore(schema, store));
        try {
          await req(os(store).put(row));
        } catch (e) {
          throw translate(e, store);
        }
      },
      delete: async (store, key) => {
        await req(os(store).delete(key));
      },
      query: async (store, q) => {
        const index = os(store).index(requireIndex(requireStore(schema, store), q.index).name);
        validateQuery(requireIndex(requireStore(schema, store), q.index), q);
        const range = keyRange(q);
        if (!q.reverse) return (await req(index.getAll(range, q.limit))) as Row[];
        const rows: Row[] = [];
        await new Promise<void>((resolve, reject) => {
          const cursor = index.openCursor(range, 'prev');
          cursor.onerror = () => reject(cursor.error);
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c || (q.limit !== undefined && rows.length >= q.limit)) return resolve();
            rows.push(c.value as Row);
            c.continue();
          };
        });
        return rows;
      },
      count: async (store, q) => {
        const def = requireStore(schema, store);
        validateQuery(requireIndex(def, q.index), q);
        return req(os(store).index(q.index).count(keyRange(q)));
      },
    };

    let result: T;
    try {
      result = await fn(typedTx(tx));
    } catch (e) {
      try {
        idbTx.abort();
      } catch {
        // already finished or aborted by the failing request
      }
      throw e;
    }
    await completion;
    return result;
  }

  async health(): Promise<StorageHealth> {
    const persistent = (await this.storage?.persisted?.()) ?? false;
    const estimate = await this.storage?.estimate?.();
    return {
      persistent,
      ...(estimate?.usage !== undefined ? { usageBytes: estimate.usage } : {}),
      ...(estimate?.quota !== undefined ? { quotaBytes: estimate.quota } : {}),
    };
  }

  /** Asks the browser not to evict this origin's data under storage pressure. */
  async requestPersistence(): Promise<boolean> {
    return (await this.storage?.persist?.()) ?? false;
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.schema = null;
  }
}
