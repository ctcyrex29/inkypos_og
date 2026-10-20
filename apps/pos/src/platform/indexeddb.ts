import type { SecretKey, SecureStore } from '@inkypos/core';
import type { CryptoKeyStore } from './device-signer';

/**
 * Minimal IndexedDB access for the web build. Phase 3 replaces the general
 * storage with the LocalStore adapter; this database keeps only device
 * identity and is separate on purpose.
 */
const DB_NAME = 'inkypos-device';
const KV = 'kv';
const KEYS = 'keys';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDeviceDb(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  const open = factory.open(DB_NAME, 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore(KV);
    open.result.createObjectStore(KEYS);
  };
  return request(open);
}

async function run<T>(db: Promise<IDBDatabase>, store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) {
  const tx = (await db).transaction(store, mode);
  const result = await request(op(tx.objectStore(store)));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return result;
}

/**
 * The web has no hardware-backed secret store. Values here are readable by
 * script on this origin; the device signing key is not stored here (see IndexedDbKeyStore).
 */
export class IndexedDbSecureStore implements SecureStore {
  readonly hardwareBacked = false;
  constructor(private readonly db: Promise<IDBDatabase>) {}

  async get(key: SecretKey): Promise<string | null> {
    const value = await run(this.db, KV, 'readonly', (s) => s.get(key) as IDBRequest<string | undefined>);
    return value ?? null;
  }
  async set(key: SecretKey, value: string): Promise<void> {
    await run(this.db, KV, 'readwrite', (s) => s.put(value, key));
  }
  async delete(key: SecretKey): Promise<void> {
    await run(this.db, KV, 'readwrite', (s) => s.delete(key));
  }
}

export class IndexedDbKeyStore implements CryptoKeyStore {
  constructor(private readonly db: Promise<IDBDatabase>) {}

  async getKeyPair(): Promise<CryptoKeyPair | null> {
    return ((await run(this.db, KEYS, 'readonly', (s) => s.get('device'))) as CryptoKeyPair | undefined) ?? null;
  }
  async setKeyPair(pair: CryptoKeyPair): Promise<void> {
    await run(this.db, KEYS, 'readwrite', (s) => s.put(pair, 'device'));
  }
  async deleteKeyPair(): Promise<void> {
    await run(this.db, KEYS, 'readwrite', (s) => s.delete('device'));
  }
}
