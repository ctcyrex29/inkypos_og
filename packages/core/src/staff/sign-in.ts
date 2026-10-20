import type { Role } from '../auth/contracts';
import type { StaffInfo } from '../catalogue/contracts';
import type { LocalStore } from '../storage/ports';
import { verifyPin } from './pin';

/**
 * Offline cashier sign-in. The till keeps the staff list and PIN hashes from
 * the change feed; failed attempts are counted per person in the local
 * database, so a lockout survives restarts and catalogue pulls.
 */

/** Consecutive failures allowed before a lockout, then 30 s doubling up to 15 minutes. */
export const PIN_LOCKOUT = { freeFailures: 4, baseMs: 30_000, maxMs: 15 * 60_000 } as const;

export function pinLockoutMs(failures: number): number {
  if (failures <= PIN_LOCKOUT.freeFailures) return 0;
  return Math.min(PIN_LOCKOUT.maxMs, PIN_LOCKOUT.baseMs * 2 ** (failures - PIN_LOCKOUT.freeFailures - 1));
}

export type SignInResult =
  | { ok: true; staff: StaffInfo }
  | { ok: false; reason: 'unknown' | 'inactive' | 'no_pin' }
  | { ok: false; reason: 'wrong_pin'; attemptsBeforeLock: number; lockedUntil: string | null }
  | { ok: false; reason: 'locked'; lockedUntil: string };

export class StaffSignIn {
  constructor(
    private readonly store: LocalStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** When this person may try again, or null when they may try now. */
  async lockedUntil(userId: string): Promise<string | null> {
    const attempts = await this.store.staff.attempts(userId);
    if (!attempts?.locked_until) return null;
    const now = this.now().getTime();
    // A clock set back to before the last failure must not lift a lockout early.
    if (now < Date.parse(attempts.last_failure_at)) return attempts.locked_until;
    return now < Date.parse(attempts.locked_until) ? attempts.locked_until : null;
  }

  async attempt(userId: string, pin: string): Promise<SignInResult> {
    const staff = await this.store.staff.get(userId);
    if (!staff) return { ok: false, reason: 'unknown' };
    if (!staff.active) return { ok: false, reason: 'inactive' };
    if (!staff.pin) return { ok: false, reason: 'no_pin' };

    const locked = await this.lockedUntil(userId);
    if (locked) return { ok: false, reason: 'locked', lockedUntil: locked };

    if (await verifyPin(pin, staff.pin)) {
      await this.store.staff.clearFailures(userId);
      return { ok: true, staff };
    }
    const attempts = await this.store.staff.recordFailure(userId, this.now().toISOString(), pinLockoutMs);
    return {
      ok: false,
      reason: 'wrong_pin',
      attemptsBeforeLock: Math.max(0, PIN_LOCKOUT.freeFailures - attempts.failures),
      lockedUntil: attempts.locked_until,
    };
  }
}

/** What a signed-in person may do on the till. Selling is for everyone; the rest is for managers. */
export type TillAction = 'sell' | 'view_diagnostics' | 'record_sample_sale';

export function tillRoleCan(role: Role, action: TillAction): boolean {
  return action === 'sell' || role !== 'cashier';
}
