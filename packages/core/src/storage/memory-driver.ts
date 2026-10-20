import {
  compareKeys,
  foldSchema,
  indexKey,
  matchesQuery,
  Mutex,
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
  type StoreDef,
  type RowTx,
  type Tx,
  typedTx,
} from './driver';

/** Backing data, shareable between driver instances to simulate an app restart. */
export class MemoryDatabase {
  version = 0;
  applied: { version: number; name: string }[] = [];
  stores = new Map<string, Map<string, Row>>();
}

const clone = <T>(v: T): T => structuredClone(v);

/** Reference driver. Each transaction works on a copy and swaps it in only on success. */
export class MemoryDriver implements StorageDriver {
  readonly backend = 'memory' as const;
  private readonly mutex = new Mutex();
  private schema: Map<string, StoreDef> | null = null;

  constructor(private readonly db: MemoryDatabase = new MemoryDatabase()) {}

  open(migrations: Migration[]): Promise<MigrationReport> {
    return this.mutex.run(async () => {
      const schema = foldSchema(migrations);
      const from = this.db.version;
      const applied: { version: number; name: string }[] = [];
      // Any unrecorded migration is applied, even one numbered below the newest (parallel branches).
      for (const m of migrations.filter((m) => !this.db.applied.some((a) => a.version === m.version))) {
        const working = this.copyStores();
        for (const step of m.steps) {
          if (step.op === 'createStore') working.set(step.store.name, new Map());
          if (step.op === 'transform') {
            const rows = working.get(step.store)!;
            for (const [k, row] of [...rows]) {
              const next = step.fn(clone(row));
              if (next === null) rows.delete(k);
              else rows.set(k, clone(next));
            }
          }
        }
        this.db.stores = working;
        this.db.version = Math.max(this.db.version, m.version);
        this.db.applied.push({ version: m.version, name: m.name });
        applied.push({ version: m.version, name: m.name });
      }
      this.schema = schema;
      // Re-check unique indexes created by later migrations against existing data.
      for (const store of schema.values()) this.checkUnique(store, this.db.stores.get(store.name)!);
      return { from, to: this.db.version, applied };
    });
  }

  transaction<T>(_mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      const schema = this.schema;
      if (!schema) throw new StorageError('not_open', 'Database is not open');
      const working = this.copyStores();
      const rowsOf = (name: string) => {
        requireStore(schema, name);
        return working.get(name)!;
      };

      const tx: RowTx = {
        get: async (store, key) => {
          const row = rowsOf(store).get(key);
          return row ? clone(row) : null;
        },
        insert: async (store, row) => {
          const def = requireStore(schema, store);
          const rows = rowsOf(store);
          const k = primaryKey(row, def);
          if (rows.has(k)) throw new StorageError('duplicate_key', `${store} already has ${k}`);
          rows.set(k, clone(row));
          this.checkUnique(def, rows);
        },
        put: async (store, row) => {
          const def = requireStore(schema, store);
          const rows = rowsOf(store);
          rows.set(primaryKey(row, def), clone(row));
          this.checkUnique(def, rows);
        },
        delete: async (store, key) => {
          rowsOf(store).delete(key);
        },
        query: async (store, q) => this.select(requireStore(schema, store), rowsOf(store), q).map(clone),
        count: async (store, { limit: _limit, ...q }) => this.select(requireStore(schema, store), rowsOf(store), q).length,
      };

      const result = await fn(typedTx(tx));
      this.db.stores = working; // commit
      return result;
    });
  }

  async health() {
    return { persistent: false };
  }

  async close(): Promise<void> {
    this.schema = null;
  }

  private copyStores(): Map<string, Map<string, Row>> {
    return new Map([...this.db.stores].map(([name, rows]) => [name, new Map(rows)]));
  }

  private select(def: StoreDef, rows: Map<string, Row>, q: IndexQuery): Row[] {
    const index = requireIndex(def, q.index);
    validateQuery(index, q);
    const hits: { key: ReturnType<typeof indexKey> & object; pk: string; row: Row }[] = [];
    for (const [pk, row] of rows) {
      const key = indexKey(row, index);
      if (key && matchesQuery(key, q)) hits.push({ key, pk, row });
    }
    hits.sort((a, b) => compareKeys(a.key, b.key) || (a.pk < b.pk ? -1 : a.pk > b.pk ? 1 : 0));
    if (q.reverse) hits.reverse();
    return (q.limit === undefined ? hits : hits.slice(0, q.limit)).map((h) => h.row);
  }

  private checkUnique(def: StoreDef, rows: Map<string, Row>): void {
    for (const index of def.indexes.filter((i) => i.unique)) {
      const seen = new Set<string>();
      for (const row of rows.values()) {
        const key = indexKey(row, index);
        if (!key) continue;
        const id = JSON.stringify(key);
        if (seen.has(id)) throw new StorageError('constraint', `Unique index ${def.name}.${index.name} violated`);
        seen.add(id);
      }
    }
  }
}
