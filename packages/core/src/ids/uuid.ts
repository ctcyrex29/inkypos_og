export type RandomBytes = (length: number) => Uint8Array;

/**
 * Uses the platform CSPRNG. There is deliberately no Math.random fallback:
 * transaction IDs must be unique across every device of every tenant.
 * React Native callers pass expo-crypto's getRandomBytes explicitly.
 */
export const platformRandomBytes: RandomBytes = (length) => {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!c?.getRandomValues) {
    throw new Error('No secure random source available; supply one explicitly');
  }
  return c.getRandomValues(new Uint8Array(length));
};

export interface UuidV7Options {
  now?: number;
  random?: RandomBytes;
}

/** RFC 9562 UUIDv7: 48-bit Unix ms timestamp followed by random bits; sortable by creation time. */
export function uuidv7(options: UuidV7Options = {}): string {
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || now >= 2 ** 48) throw new RangeError('timestamp out of range');
  const bytes = (options.random ?? platformRandomBytes)(16);
  if (bytes.length !== 16) throw new Error('random source must return 16 bytes');
  const out = new Uint8Array(bytes);
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    out[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  out[6] = 0x70 | ((out[6] ?? 0) & 0x0f);
  out[8] = 0x80 | ((out[8] ?? 0) & 0x3f);
  const hex = Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(value: string): boolean {
  return UUID_V7.test(value);
}

export function uuidV7Timestamp(value: string): number {
  if (!isUuidV7(value)) throw new Error(`Not a UUIDv7: ${value}`);
  return parseInt(value.replace(/-/g, '').slice(0, 12), 16);
}
