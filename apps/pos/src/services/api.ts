import { createApiClient, uuidv7, type ApiClient, type TrustedEntitlementKeys } from '@inkypos/core';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { Platform } from 'react-native';
import type { ClientAuth } from './device-session';

/**
 * EXPO_PUBLIC_API_URL is inlined at build time. On the Android emulator the
 * host machine is 10.0.2.2, not localhost; on a physical device use the LAN IP.
 */
export function defaultApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

/**
 * Public keys that may sign entitlement documents, as JSON {"key_id": "base64url"}.
 * Produced by `php artisan inkypos:entitlement-key`.
 */
export function trustedEntitlementKeys(): TrustedEntitlementKeys {
  try {
    const parsed: unknown = JSON.parse(process.env.EXPO_PUBLIC_ENTITLEMENT_KEYS ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as TrustedEntitlementKeys) : {};
  } catch {
    return {};
  }
}

/** expo-crypto supplies a CSPRNG on every platform, including Hermes where crypto.getRandomValues may be absent. */
export const newId = (): string => uuidv7({ random: getRandomBytes });

export function createAppApiClient(baseUrl = defaultApiBaseUrl(), auth?: ClientAuth): ApiClient {
  return createApiClient({
    baseUrl,
    fetch: (input, init) => globalThis.fetch(input, init),
    generateId: newId,
    clientVersion: `pos/${Constants.expoConfig?.version ?? 'dev'} (${Platform.OS})`,
    getAccessToken: auth ? async () => auth.token() : undefined,
    tenantId: auth?.tenantId,
  });
}
