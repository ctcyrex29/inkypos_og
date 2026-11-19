import type { StaffInfo } from '@inkypos/core';

/** A cashier left signed in but untouched for this long is signed out. */
export const CASHIER_IDLE_MS = 5 * 60_000;

/** The till locks when the app comes back after being in the background this long (like a phone app lock). */
export const LOCK_AFTER_BACKGROUND_MS = 60_000;

export interface SignedInCashier {
  staff: StaffInfo;
  signedInAt: number;
  lastActivityAt: number;
}

/**
 * Who is selling on this till right now, i.e. whether the till is unlocked.
 * Held in memory only: restarting the app locks it again (the lock screen
 * remembers who it was and asks for their PIN). React-free so the timing rules
 * are easy to test.
 */
export class CashierSession {
  private current: SignedInCashier | null = null;
  private backgroundSince: number | null = null;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly idleMs = CASHIER_IDLE_MS,
    private readonly backgroundMs = LOCK_AFTER_BACKGROUND_MS,
  ) {}

  get cashier(): SignedInCashier | null {
    return this.current;
  }

  signIn(staff: StaffInfo): void {
    const at = this.now();
    this.current = { staff, signedInAt: at, lastActivityAt: at };
  }

  signOut(): void {
    this.current = null;
  }

  /** Any touch or key press while signed in. */
  touch(): void {
    if (this.current) this.current = { ...this.current, lastActivityAt: this.now() };
  }

  /** The app went to the background (another app, the home button, screen off). */
  wentToBackground(): void {
    this.backgroundSince = this.now();
  }

  /** The app is back in front: locks when it was away too long. True when that happened. */
  cameToForeground(): boolean {
    const since = this.backgroundSince;
    this.backgroundSince = null;
    if (this.current && since !== null && this.now() - since >= this.backgroundMs) {
      this.current = null;
      return true;
    }
    return this.expireIfIdle();
  }

  /** Signs out after inactivity; true when that happened. */
  expireIfIdle(): boolean {
    if (!this.current || this.now() - this.current.lastActivityAt < this.idleMs) return false;
    this.current = null;
    return true;
  }

  /**
   * Applies the latest pulled staff record: a person deactivated, removed, or
   * whose PIN or role changed is signed out.
   */
  refresh(latest: StaffInfo | null): boolean {
    if (!this.current) return false;
    const before = this.current.staff;
    if (latest && latest.active && latest.role === before.role && latest.pin?.hash === before.pin?.hash) {
      this.current = { ...this.current, staff: latest };
      return false;
    }
    this.current = null;
    return true;
  }
}
