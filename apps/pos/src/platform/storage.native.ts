import { createLocalStore, SqliteDriver, type HarnessFactory, type LocalStore, type SqlDatabase } from '@inkypos/core';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'inkypos.db';

function adapt(db: SQLiteDatabase): SqlDatabase {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => ({ changes: (await db.runAsync(sql, params)).changes }),
    all: (sql, params) => db.getAllAsync(sql, params),
    close: () => db.closeAsync(),
  };
}

async function open(name: string, migrations?: Parameters<typeof createLocalStore>[1]): Promise<LocalStore> {
  return createLocalStore(new SqliteDriver(adapt(await openDatabaseAsync(name)), 'expo-sqlite'), migrations);
}

/** The till's database. Lives in the app sandbox: survives restarts and updates, not uninstalls. */
export function openLocalStore(): Promise<LocalStore> {
  return open(DB_NAME);
}

/** Throwaway databases for the on-device storage contract (Diagnostics screen). */
export const storageHarness: HarnessFactory = async () => {
  const name = `inkypos-selftest-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  let current: LocalStore | null = null;
  let open_ = false;
  return {
    open: async (migrations) => {
      const store = await open(name, migrations ? { migrations } : {});
      open_ = true;
      current = { ...store, close: async () => ((open_ = false), store.close()) };
      return current;
    },
    destroy: async () => {
      if (open_) await current?.close();
      await deleteDatabaseAsync(name).catch(() => undefined);
    },
  };
};

/** Native app storage is not evictable by the OS. */
export async function requestPersistentStorage(): Promise<boolean> {
  return true;
}
