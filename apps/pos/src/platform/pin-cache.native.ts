import type { PinCheckCache } from '@inkypos/core';
import * as ExpoSecureStore from 'expo-secure-store';

const options: ExpoSecureStore.SecureStoreOptions = {
  // Encrypted by the phone's keystore, never restored to another phone from a backup.
  keychainAccessible: ExpoSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// SecureStore keys allow only [A-Za-z0-9._-]; staff ids are UUIDs.
const key = (userId: string) => `pincheck.${userId.replace(/[^A-Za-z0-9._-]/g, '')}`;

export const pinCheckCache: PinCheckCache = {
  get: (userId) => ExpoSecureStore.getItemAsync(key(userId), options).catch(() => null),
  set: async (userId, value) => {
    if (value === null) await ExpoSecureStore.deleteItemAsync(key(userId), options);
    else await ExpoSecureStore.setItemAsync(key(userId), value, options);
  },
};
