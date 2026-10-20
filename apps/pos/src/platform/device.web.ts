import type { SecureStore } from '@inkypos/core';
import type { DeviceSigner } from './device-signer';
import { WebCryptoSigner } from './device-signer';
import { IndexedDbKeyStore, IndexedDbSecureStore, openDeviceDb } from './indexeddb';

export function createDevicePorts(): { vault: SecureStore; signer: DeviceSigner } {
  const db = openDeviceDb();
  return { vault: new IndexedDbSecureStore(db), signer: new WebCryptoSigner(new IndexedDbKeyStore(db)) };
}
