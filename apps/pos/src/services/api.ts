import { createApiClient, uuidv7, type ApiClient } from '@inkypos/core';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * EXPO_PUBLIC_API_URL is inlined at build time. On the Android emulator the
 * host machine is 10.0.2.2, not localhost; on a physical device use the LAN IP.
 */
export function defaultApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

/** expo-crypto supplies a CSPRNG on every platform, including Hermes where crypto.getRandomValues may be absent. */
export const newId = (): string => uuidv7({ random: getRandomBytes });

export function createAppApiClient(baseUrl = defaultApiBaseUrl()): ApiClient {
  return createApiClient({
    baseUrl,
    fetch: (input, init) => globalThis.fetch(input, init),
    generateId: newId,
    clientVersion: `pos/${Constants.expoConfig?.version ?? 'dev'} (${Platform.OS})`,
  });
}
