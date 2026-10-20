/// <reference types="node" />
import 'fake-indexeddb/auto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  createLocalStore,
  IndexedDbDriver,
  MemoryDatabase,
  MemoryDriver,
  SqliteDriver,
  STORAGE_CONTRACT,
  uuidv7,
  type HarnessFactory,
  type SqlDatabase,
  type SqlValue,
  type Tx,
  runStorageContract,
} from '../src';

/** node:sqlite behind the same SqlDatabase interface the app implements with expo-sqlite. */
function nodeSqlite(path: string): SqlDatabase {
  const db = new DatabaseSync(path);
  return {
    exec: async (sql) => void db.exec(sql),
    run: async (sql, params: SqlValue[]) => ({ changes: Number(db.prepare(sql).run(...params).changes) }),
    all: async <T>(sql: string, params: SqlValue[]) => db.prepare(sql).all(...params) as T[],
    close: async () => db.close(),
  };
}

const harnesses: Record<string, HarnessFactory> = {
  memory: async () => {
    const data = new MemoryDatabase();
    let store: ReturnType<typeof createLocalStore> | null = null;
    return {
      open: async (migrations) => (store = createLocalStore(new MemoryDriver(data), migrations ? { migrations } : {})),
      destroy: async () => void (await store?.close()),
    };
  },

  'sqlite (node:sqlite, same driver as expo-sqlite)': async () => {
    const dir = mkdtempSync(join(tmpdir(), 'inkypos-'));
    const file = join(dir, 'pos.db');
    let store: ReturnType<typeof createLocalStore> | null = null;
    let closed = true;
    return {
      open: async (migrations) => {
        closed = false;
        const s = createLocalStore(new SqliteDriver(nodeSqlite(file)), migrations ? { migrations } : {});
        const close = s.close;
        store = { ...s, close: async () => ((closed = true), close()) };
        return store;
      },
      destroy: async () => {
        if (!closed) await store?.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  },

  'indexeddb (fake-indexeddb)': async () => {
    const name = `inkypos-test-${uuidv7()}`;
    let store: ReturnType<typeof createLocalStore> | null = null;
    return {
      open: async (migrations) => (store = createLocalStore(new IndexedDbDriver(name), migrations ? { migrations } : {})),
      destroy: async () => {
        await store?.close();
        await new Promise((resolve) => {
          const r = indexedDB.deleteDatabase(name);
          r.onsuccess = r.onerror = r.onblocked = () => resolve(undefined);
        });
      },
    };
  },
};

/** A deliberately broken driver: every operation commits on its own, so failures leave partial writes. */
class NonAtomicDriver extends MemoryDriver {
  override transaction<T>(mode: 'readonly' | 'readwrite', fn: (tx: Tx) => Promise<T>): Promise<T> {
    const single = <R>(op: (tx: Tx) => Promise<R>) => super.transaction(mode, op);
    return fn({
      get: (s, k) => single((tx) => tx.get(s, k)),
      insert: (s, r) => single((tx) => tx.insert(s, r)),
      put: (s, r) => single((tx) => tx.put(s, r)),
      delete: (s, k) => single((tx) => tx.delete(s, k)),
      query: (s, q) => single((tx) => tx.query(s, q)),
      count: (s, q) => single((tx) => tx.count(s, q)),
    } as Tx);
  }
}

describe('storage contract self-check', () => {
  it('fails a driver that is not atomic', async () => {
    const make: HarnessFactory = async () => {
      const data = new MemoryDatabase();
      return { open: async () => createLocalStore(new NonAtomicDriver(data)), destroy: async () => undefined };
    };
    const results = await runStorageContract(make, () => uuidv7());
    const rollback = results.find((r) => r.name.startsWith('rolls back'));
    expect(rollback?.ok).toBe(false);
    expect(rollback?.error).toMatch(/rolled back/);
  });
});

for (const [driver, make] of Object.entries(harnesses)) {
  describe(`storage contract: ${driver}`, () => {
    for (const scenario of STORAGE_CONTRACT) {
      it(scenario.name, () => scenario.run(make, () => uuidv7()));
    }
  });
}
