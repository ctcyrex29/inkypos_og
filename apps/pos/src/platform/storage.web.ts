import { createLocalStore, IndexedDbDriver, type HarnessFactory, type LocalStore } from '@inkypos/core';

const DB_NAME = 'inkypos-local';

/**
 * The till's database in the browser. IndexedDB can be cleared by the user or
 * evicted under storage pressure unless persistence is granted; the app asks
 * for it and warns when it is refused (docs/ARCHITECTURE.md §8).
 */
export async function openLocalStore(): Promise<LocalStore> {
  return createLocalStore(new IndexedDbDriver(DB_NAME));
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Throwaway databases for the in-browser storage contract (Diagnostics screen). */
export const storageHarness: HarnessFactory = async () => {
  const name = `inkypos-selftest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let current: LocalStore | null = null;
  return {
    open: async (migrations) => (current = createLocalStore(new IndexedDbDriver(name), migrations ? { migrations } : {})),
    destroy: async () => {
      await current?.close();
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    },
  };
};
