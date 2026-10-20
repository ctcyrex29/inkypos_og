import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { utf8Encode } from '../encoding/base64url';

// Synchronous SHA-512 so signing works on Hermes, which has no crypto.subtle.
ed.hashes.sha512 = sha512;

export interface DeviceKeyPair {
  /** 32-byte RFC 8032 seed. Never leaves the device's secure storage. */
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

/** The caller supplies the 32 random bytes from the platform CSPRNG (expo-crypto). */
export function deviceKeyPairFromSeed(seed: Uint8Array): DeviceKeyPair {
  if (seed.length !== 32) throw new RangeError('Ed25519 seed must be 32 bytes');
  return { secretKey: seed, publicKey: ed.getPublicKey(seed) };
}

/**
 * Exact bytes a device signs to obtain a token. Domain-separated so a device
 * signature can never be replayed as any other kind of signature.
 * Mirrored in apps/api/app/Devices/DeviceAuthMessage.php.
 */
export function deviceAuthMessage(deviceId: string, challenge: string): Uint8Array {
  return utf8Encode(`inkypos-device-auth:v1:${deviceId}:${challenge}`);
}

export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ed.sign(message, secretKey);
}

/** Strict RFC 8032 verification, matching libsodium on the server. */
export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
}
