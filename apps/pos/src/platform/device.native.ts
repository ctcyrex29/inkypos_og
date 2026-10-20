import type { SecretKey, SecureStore } from '@inkypos/core';
import { getRandomBytes } from 'expo-crypto';
import * as ExpoSecureStore from 'expo-secure-store';
import { SeedSigner, type DeviceSigner } from './device-signer';

const options: ExpoSecureStore.SecureStoreOptions = {
  // Never restored to another phone from a backup, and readable only while unlocked.
  keychainAccessible: ExpoSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// SecureStore keys allow only [A-Za-z0-9._-].
class NativeSecureStore implements SecureStore {
  readonly hardwareBacked = true;
  get(key: SecretKey) {
    return ExpoSecureStore.getItemAsync(key, options);
  }
  set(key: SecretKey, value: string) {
    return ExpoSecureStore.setItemAsync(key, value, options);
  }
  delete(key: SecretKey) {
    return ExpoSecureStore.deleteItemAsync(key, options);
  }
}

export function createDevicePorts(): { vault: SecureStore; signer: DeviceSigner } {
  const vault = new NativeSecureStore();
  return { vault, signer: new SeedSigner(vault, getRandomBytes) };
}
