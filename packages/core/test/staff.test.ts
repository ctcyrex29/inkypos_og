import { describe, expect, it } from 'vitest';
import {
  createLocalStore,
  makePinHash,
  MemoryDatabase,
  MemoryDriver,
  pinLockoutMs,
  pinWeakness,
  staffDataSchema,
  StaffSignIn,
  tillRoleCan,
  uuidv7,
  verifyPin,
  type StaffInfo,
} from '../src';
import vectors from '../test-vectors/staff-pin.v1.json';

const salt = Uint8Array.from({ length: 16 }, (_, i) => i);

describe('PIN hashing', () => {
  it('verifies the shared vectors, which the server reproduces with hash_pbkdf2', async () => {
    for (const v of vectors) {
      const published = { algorithm: 'pbkdf2-sha256' as const, iterations: v.iterations, salt: v.salt, hash: v.hash };
      expect(await verifyPin(v.pin, published), v.pin).toBe(true);
      expect(await verifyPin(v.pin === '4821' ? '4822' : '4821', published)).toBe(false);
    }
  });

  it('refuses anything that is not 4-6 digits without hashing it', async () => {
    const published = await makePinHash('4821', salt, 10_000);
    for (const pin of ['', '482', '4821 ', '48210000', '48a1']) expect(await verifyPin(pin, published)).toBe(false);
  });
});

describe('pinWeakness (same rules as App\\Staff\\StaffPin::weakness)', () => {
  it('refuses what the server refuses', () => {
    for (const pin of ['', '12', '1234567', 'abcd', '12a4', '0000', '999999', '1234', '6543', '345678']) expect(pinWeakness(pin), pin).not.toBeNull();
    for (const pin of ['4821', '0042', '739510', '50513']) expect(pinWeakness(pin), pin).toBeNull();
  });
});

describe('till sign-in', () => {
  async function setup(staff: Partial<StaffInfo> = {}) {
    const store = createLocalStore(new MemoryDriver(new MemoryDatabase()));
    await store.migrate();
    const id = uuidv7();
    const data: StaffInfo = { id, name: 'Zoe', role: 'cashier', active: true, pin: await makePinHash('4821', salt, 10_000), version: 1, ...staff };
    await store.reference.applyPull([{ entity: 'staff', op: 'upsert', id, version: 1, data }], 'log:1');
    let now = Date.parse('2026-10-20T09:00:00Z');
    const clock = { advance: (ms: number) => void (now += ms), set: (iso: string) => void (now = Date.parse(iso)) };
    return { store, id, clock, signIn: new StaffSignIn(store, () => new Date(now)) };
  }

  it('signs in with the right PIN', async () => {
    const { signIn, id } = await setup();
    const result = await signIn.attempt(id, '4821');
    expect(result.ok && result.staff.name).toBe('Zoe');
  });

  it('locks a person out after repeated failures, with growing delays, and remembers it', async () => {
    const { signIn, id, clock, store } = await setup();
    for (let i = 1; i <= 4; i++) {
      const r = await signIn.attempt(id, '0000');
      expect(r).toMatchObject({ ok: false, reason: 'wrong_pin', attemptsBeforeLock: 4 - i, lockedUntil: null });
    }
    expect(await signIn.attempt(id, '1111')).toMatchObject({ reason: 'wrong_pin', lockedUntil: '2026-10-20T09:00:30.000Z' });

    // Even the right PIN is not checked while locked.
    expect(await signIn.attempt(id, '4821')).toMatchObject({ reason: 'locked', lockedUntil: '2026-10-20T09:00:30.000Z' });
    // Setting the clock back does not lift it.
    clock.set('2026-10-20T08:00:00Z');
    expect(await signIn.attempt(id, '4821')).toMatchObject({ reason: 'locked' });

    clock.set('2026-10-20T09:00:31Z');
    expect(await signIn.attempt(id, '2222')).toMatchObject({ reason: 'wrong_pin', lockedUntil: '2026-10-20T09:01:31.000Z' });
    expect((await store.staff.attempts(id))?.failures).toBe(6);

    clock.advance(61_000);
    expect((await signIn.attempt(id, '4821')).ok).toBe(true);
    expect(await store.staff.attempts(id)).toBeNull();
  });

  it('caps the lockout', () => {
    expect([4, 5, 6, 7].map(pinLockoutMs)).toEqual([0, 30_000, 60_000, 120_000]);
    expect(pinLockoutMs(40)).toBe(15 * 60_000);
  });

  it('refuses inactive staff, staff without a PIN and unknown people', async () => {
    expect(await (await setup({ active: false })).signIn.attempt((await setup()).id, '4821')).toMatchObject({ reason: 'unknown' });
    const inactive = await setup({ active: false });
    expect(await inactive.signIn.attempt(inactive.id, '4821')).toMatchObject({ reason: 'inactive' });
    const noPin = await setup({ pin: null });
    expect(await noPin.signIn.attempt(noPin.id, '4821')).toMatchObject({ reason: 'no_pin' });
  });

  it('keeps manager-only actions away from cashiers', () => {
    expect(tillRoleCan('cashier', 'sell')).toBe(true);
    expect(tillRoleCan('cashier', 'view_diagnostics')).toBe(false);
    expect(tillRoleCan('manager', 'view_diagnostics')).toBe(true);
    expect(tillRoleCan('owner', 'record_sample_sale')).toBe(true);
  });

  it('accepts the server payload shape', () => {
    const parsed = staffDataSchema.safeParse({
      id: uuidv7(), name: 'Zoe', role: 'cashier', active: true, version: 2,
      pin: { algorithm: 'pbkdf2-sha256', iterations: 100_000, salt: 'AAECAwQFBgcICQoLDA0ODw', hash: 'x'.repeat(43) },
    });
    expect(parsed.success).toBe(true);
    expect(staffDataSchema.safeParse({ ...parsed.data, pin: { ...parsed.data!.pin, iterations: 5_000_000 } }).success).toBe(false);
  });
});
