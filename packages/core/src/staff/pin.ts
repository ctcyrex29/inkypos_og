import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { StaffPinHash } from '../catalogue/contracts';
import { base64UrlDecode, base64UrlEncode, utf8Encode } from '../encoding/base64url';

/**
 * Till sign-in PINs, verified offline against the hash the server publishes
 * (apps/api/app/Staff/StaffPin.php): PBKDF2-HMAC-SHA256 over the PIN digits
 * with a per-person salt. Pure JavaScript, so it runs the same in Hermes,
 * browsers and Node. Shared vectors: test-vectors/staff-pin.v1.json.
 */

export const PIN_PATTERN = /^\d{4,6}$/;

/**
 * Why a new PIN would be refused, or null when it is acceptable. Mirrors
 * App\Staff\StaffPin::weakness so the back office can say so before sending;
 * the server still decides.
 */
export function pinWeakness(pin: string): string | null {
  if (!PIN_PATTERN.test(pin)) return 'The PIN must be 4 to 6 digits.';
  if (new Set(pin).size === 1) return 'The PIN cannot repeat one digit.';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'The PIN cannot be a run of consecutive digits.';
  return null;
}

/** Async so a slow phone keeps drawing while the hash runs (noble yields every few ms). */
export async function derivePinHash(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8Encode(pin), salt, { c: iterations, dkLen: 32, asyncTick: 10 });
}

/** Builds a published hash; used by tests and tooling (the server makes the real ones). */
export async function makePinHash(pin: string, salt: Uint8Array, iterations: number): Promise<StaffPinHash> {
  return { algorithm: 'pbkdf2-sha256', iterations, salt: base64UrlEncode(salt), hash: base64UrlEncode(await derivePinHash(pin, salt, iterations)) };
}

export async function verifyPin(pin: string, published: StaffPinHash): Promise<boolean> {
  if (!PIN_PATTERN.test(pin) || published.algorithm !== 'pbkdf2-sha256') return false;
  const expected = base64UrlDecode(published.hash);
  const actual = await derivePinHash(pin, base64UrlDecode(published.salt), published.iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
