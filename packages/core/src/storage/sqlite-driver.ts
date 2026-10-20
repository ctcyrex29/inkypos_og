import {
  foldSchema,
  indexKey,
  Mutex,
  primaryKey,
  requireIndex,
  requireStore,
  StorageError,
  validateQuery,
  type IndexDef,
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

/**
 * The few SQLite calls the driver needs. Implemented over expo-sqlite in the
 * app and over node:sqlite in tests, so the same driver code runs in both.
 */
export interface SqlDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  all<T = Record<string, unknown>>(sql: string, params: SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}

export type SqlValue = string | number | null;

const table = (store: string) => `s_${store}`;
const column = (index: string, i: number) => `i_${index}_${i}`;
const sqlIndex = (store: string, index: string) => `x_${store}_${index}`;

function isUniqueViolation(e: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));
}

/**
 * One table per store: k (primary key), doc (JSON), and one column per index
 * field. Columns are untyped so numbers sort before text, matching IndexedDB.
 *
 * All access is serialised through a mutex and wrapped in explicit
 * BEGIN IMMEDIATE / COMMIT, so a transaction never interleaves with another
 * caller's statements on the same connection.
 */
export class SqliteDriver implements StorageDriver {
  private readonly mutex = new Mutex();
  private schema: Map<string, StoreDef> | null = null;

  constructor(
    private readonly db: SqlDatabase,
    readonly backend: 'expo-sqlite' | 'sqlite' = 'sqlite',
  ) {}

  open(migrations: Migration[]): Promise<MigrationReport> {
    return this.mutex.run(async () => {
      // WAL keeps readers non-blocking; FULL sync makes a committed sale survive power loss.
      await this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
      await this.db.exec(
        'CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
      );
      const final = foldSchema(migrations);
      const done = new Set((await this.db.all<{ version: number }>('SELECT version FROM _migrations', [])).map((r) => Number(r.version)));
      const from = Math.max(0, ...done);
      const applied: { version: number; name: string }[] = [];

      // Any migration not yet recorded is applied, even one numbered below the
      // newest applied (branches developed in parallel can add one in between).
      for (const m of migrations.filter((m) => !done.has(m.version))) {
        await this.db.exec('BEGIN IMMEDIATE');
        try {
          // Schema as it stands after this migration, so steps know existing indexes.
          const running = foldSchema(migrations.filter((x) => done.has(x.version) || x.version === m.version || applied.some((a) => a.version === x.version)));
          for (const step of m.steps) await this.applyStep(step, running);
          await this.db.run('INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)', [
            m.version,
            m.name,
            new Date().toISOString(),
          ]);
          await this.db.exec('COMMIT');
        } catch (e) {
          await this.db.exec('ROLLBACK');
          throw e;
        }
        applied.push({ version: m.version, name: m.name });
      }
      this.schema = final;
      return { from, to: Math.max(from, ...applied.map((a) => a.version)), applied };
    });
  }

  private async applyStep(step: Migration['steps'][number], schema: Map<string, StoreDef>): Promise<void> {
    switch (step.op) {
      case 'createStore': {
        const cols = step.store.indexes.flatMap((ix) => ix.fields.map((_, i) => `, ${column(ix.name, i)}`)).join('');
        await this.db.exec(`CREATE TABLE ${table(step.store.name)} (k TEXT PRIMARY KEY NOT NULL, doc TEXT NOT NULL${cols})`);
        for (const ix of step.store.indexes) await this.createSqlIndex(step.store.name, ix);
        return;
      }
      case 'createIndex': {
        const existing = await this.db.all<{ name: string }>(`PRAGMA table_info(${table(step.store)})`, []);
        for (let i = 0; i < step.index.fields.length; i++) {
          if (!existing.some((c) => c.name === column(step.index.name, i))) {
            await this.db.exec(`ALTER TABLE ${table(step.store)} ADD COLUMN ${column(step.index.name, i)}`);
          }
        }
        await this.rewriteRows(requireStore(schema, step.store), (row) => row);
        await this.createSqlIndex(step.store, step.index);
        return;
      }
      case 'deleteIndex':
        await this.db.exec(`DROP INDEX IF EXISTS ${sqlIndex(step.store, step.name)}`);
        return;
      case 'transform':
        await this.rewriteRows(requireStore(schema, step.store), step.fn);
        return;
    }
  }

  private async createSqlIndex(store: string, ix: IndexDef): Promise<void> {
    const cols = ix.fields.map((_, i) => column(ix.name, i)).join(', ');
    await this.db.exec(`CREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX ${sqlIndex(store, ix.name)} ON ${table(store)} (${cols})`);
  }

  private async rewriteRows(def: StoreDef, fn: (row: Row) => Row | null): Promise<void> {
    const rows = await this.db.all<{ k: string; doc: string }>(`SELECT k, doc FROM ${table(def.name)}`, []);
    for (const { k, doc } of rows) {
      const next = fn(JSON.parse(doc) as Row);
      if (next === null) await this.db.run(`DELETE FROM ${table(def.name)} WHERE k = ?`, [k]);
      else {
        await this.db.run(`DELETE FROM ${table(def.name)} WHERE k = ?`, [k]);
        await this.write(def, next, 'insert');
      }
    }
  }

  private async write(def: StoreDef, row: Row, mode: 'insert' | 'put'): Promise<void> {
    const k = primaryKey(row, def);
    const cols = ['k', 'doc'];
    const values: SqlValue[] = [k, JSON.stringify(row)];
    for (const ix of def.indexes) {
      const key = indexKey(row, ix); // a row missing any field is left out of the index
      ix.fields.forEach((_, i) => {
        cols.push(column(ix.name, i));
        values.push(key ? key[i]! : null);
      });
    }
    const placeholders = cols.map(() => '?').join(', ');
    const update = cols.slice(1).map((c) => `${c} = excluded.${c}`).join(', ');
    const sql =
      mode === 'insert'
        ? `INSERT INTO ${table(def.name)} (${cols.join(', ')}) VALUES (${placeholders})`
        : `INSERT INTO ${table(def.name)} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT(k) DO UPDATE SET ${update}`;
    try {
      await this.db.run(sql, values);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = mode === 'insert' && (await this.db.all(`SELECT 1 FROM ${table(def.name)} WHERE k = ?`, [k])).length > 0;
      throw existing
        ? new StorageError('duplicate_key', `${def.name} already has ${k}`)
        : new StorageError('constraint', `Unique index on ${def.name} violated`);
    }
  }

  private select(def: StoreDef, q: IndexQuery, countOnly: boolean): { sql: string; params: SqlValue[] } {
    const ix = requireIndex(def, q.index);
    validateQuery(ix, q);
    const cols = ix.fields.map((_, i) => column(ix.name, i));
    const where = cols.map((c) => `${c} IS NOT NULL`);
    const params: SqlValue[] = [];
    (q.eq ?? []).forEach((v, i) => {
      where.push(`${cols[i]} = ?`);
      params.push(v);
    });
    const next = cols[(q.eq ?? []).length];
    if (q.gte !== undefined) {
      where.push(`${next} >= ?`);
      params.push(q.gte);
    }
    if (q.lte !== undefined) {
      where.push(`${next} <= ?`);
      params.push(q.lte);
    }
    if (countOnly) return { sql: `SELECT COUNT(*) AS n FROM ${table(def.name)} WHERE ${where.join(' AND ')}`, params };
    const dir = q.reverse ? 'DESC' : 'ASC';
    const order = [...cols, 'k'].map((c) => `${c} ${dir}`).join(', ');
    const limit = q.limit === undefined ? '' : ` LIMIT ${Math.max(0, Math.floor(q.limit))}`;
    return { sql: `SELECT doc FROM ${table(def.name)} WHERE ${where.join(' AND ')} ORDER BY ${order}${limit}`, params };
  }

  transaction<T>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      const schema = this.schema;
      if (!schema) throw new StorageError('not_open', 'Database is not open');
      const def = (store: string) => requireStore(schema, store);

      const tx: RowTx = {
        get: async (store, key) => {
          const rows = await this.db.all<{ doc: string }>(`SELECT doc FROM ${table(def(store).name)} WHERE k = ?`, [key]);
          return rows[0] ? (JSON.parse(rows[0].doc) as Row) : null;
        },
        insert: (store, row) => this.write(def(store), row, 'insert'),
        put: (store, row) => this.write(def(store), row, 'put'),
        delete: async (store, key) => {
          await this.db.run(`DELETE FROM ${table(def(store).name)} WHERE k = ?`, [key]);
        },
        query: async (store, q) => {
          const { sql, params } = this.select(def(store), q, false);
          return (await this.db.all<{ doc: string }>(sql, params)).map((r) => JSON.parse(r.doc) as Row);
        },
        count: async (store, q) => {
          const { sql, params } = this.select(def(store), q, true);
          return Number((await this.db.all<{ n: number }>(sql, params))[0]?.n ?? 0);
        },
      };

      await this.db.exec(mode === 'readwrite' ? 'BEGIN IMMEDIATE' : 'BEGIN');
      try {
        const result = await fn(typedTx(tx));
        await this.db.exec('COMMIT');
        return result;
      } catch (e) {
        await this.db.exec('ROLLBACK');
        throw e;
      }
    });
  }

  async health() {
    return { persistent: true };
  }

  close(): Promise<void> {
    return this.mutex.run(async () => {
      this.schema = null;
      await this.db.close();
    });
  }
}
