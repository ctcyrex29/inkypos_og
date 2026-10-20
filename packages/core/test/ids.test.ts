import { describe, expect, it } from 'vitest';
import { isUuidV7, uuidv7, uuidV7Timestamp } from '../src';

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 identifiers carrying the timestamp', () => {
    const now = Date.UTC(2026, 9, 20, 8, 30);
    const value = uuidv7({ now });
    expect(isUuidV7(value)).toBe(true);
    expect(uuidV7Timestamp(value)).toBe(now);
  });

  it('sets version and variant bits regardless of random input', () => {
    const value = uuidv7({ now: 1, random: () => new Uint8Array(16).fill(0xff) });
    expect(value).toBe('00000000-0001-7fff-bfff-ffffffffffff');
  });

  it('sorts by creation time', () => {
    const a = uuidv7({ now: 1_000 });
    const b = uuidv7({ now: 2_000 });
    expect([b, a].sort()).toEqual([a, b]);
  });

  it('does not collide across a large sample', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50_000; i++) seen.add(uuidv7({ now: 1_700_000_000_000 }));
    expect(seen.size).toBe(50_000);
  });

  it('refuses to run without a secure random source', () => {
    expect(() => uuidv7({ random: () => new Uint8Array(8) })).toThrow(/16 bytes/);
  });
});
