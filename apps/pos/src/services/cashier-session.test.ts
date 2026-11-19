import { uuidv7, type StaffInfo } from '@inkypos/core';
import { CashierSession } from './cashier-session';

const pin = { algorithm: 'pbkdf2-sha256' as const, iterations: 10_000, salt: 'AAAAAAAAAAAAAAAAAAAAAA', hash: 'B'.repeat(43) };
const zoe: StaffInfo = { id: uuidv7(), name: 'Zoe', role: 'cashier', active: true, pin, version: 1 };

function setup() {
  let now = 0;
  const session = new CashierSession(() => now, 60_000);
  return { session, advance: (ms: number) => void (now += ms) };
}

describe('CashierSession', () => {
  it('signs out after the idle time, and activity postpones it', () => {
    const { session, advance } = setup();
    session.signIn(zoe);
    advance(50_000);
    session.touch();
    advance(50_000);
    expect(session.expireIfIdle()).toBe(false);
    advance(10_000);
    expect(session.expireIfIdle()).toBe(true);
    expect(session.cashier).toBeNull();
  });

  it('signs out when a pull deactivates the cashier or changes their PIN or role', () => {
    const { session } = setup();
    session.signIn(zoe);
    expect(session.refresh({ ...zoe, name: 'Zoë', version: 2 })).toBe(false);
    expect(session.cashier?.staff.name).toBe('Zoë');

    for (const latest of [null, { ...zoe, active: false }, { ...zoe, role: 'manager' as const }, { ...zoe, pin: { ...pin, hash: 'C'.repeat(43) } }]) {
      session.signIn(zoe);
      expect(session.refresh(latest)).toBe(true);
      expect(session.cashier).toBeNull();
    }
  });
});

describe('CashierSession app lock', () => {
  it('locks when the app comes back after a minute in the background, not after a glance away', () => {
    let now = 0;
    const session = new CashierSession(() => now, 5 * 60_000, 60_000);
    session.signIn(zoe);
    session.wentToBackground();
    now += 20_000;
    expect(session.cameToForeground()).toBe(false);
    expect(session.cashier?.staff.id).toBe(zoe.id);

    session.wentToBackground();
    now += 60_000;
    expect(session.cameToForeground()).toBe(true);
    expect(session.cashier).toBeNull();
  });
});
