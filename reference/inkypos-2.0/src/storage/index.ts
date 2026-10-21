/**
 * InkyPOS 2.0 — Storage Factory & Platform Dispatcher
 */

import { IStorageAdapter } from './adapter.ts';
import { MemoryStorageAdapter } from './memory.ts';
import { IndexedDBStorageAdapter } from './indexeddb.ts';

let defaultAdapterInstance: IStorageAdapter | null = null;

export async function createStorageAdapter(preferred?: 'memory' | 'indexeddb'): Promise<IStorageAdapter> {
  if (preferred === 'memory') {
    const mem = new MemoryStorageAdapter();
    await mem.init();
    return mem;
  }

  // If in browser environment and IndexedDB is available
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    try {
      const idb = new IndexedDBStorageAdapter();
      await idb.init();
      return idb;
    } catch (err) {
      console.warn('Failed to initialize IndexedDB, falling back to MemoryStorageAdapter:', err);
    }
  }

  // Fallback to memory
  const mem = new MemoryStorageAdapter();
  await mem.init();
  return mem;
}

export async function getDefaultStorageAdapter(): Promise<IStorageAdapter> {
  if (!defaultAdapterInstance) {
    defaultAdapterInstance = await createStorageAdapter();
  }
  return defaultAdapterInstance;
}
