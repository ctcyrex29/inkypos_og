import type { StaffInfo } from '@inkypos/core';

/** A cashier left signed in but untouched for this long is signed out. */
export const CASHIER_IDLE_MS = 5 * 60_000;

export interface SignedInCashier {
  staff: StaffInfo;
  signedInAt: number;
  lastActivityAt: number;
}

/**
 * Who is selling on this till right now. Held in memory only: restarting the
 * app signs everyone out. React-free so the timing rules are easy to test.
 */
export class CashierSession {
  private current: SignedInCashier | null = null;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly idleMs = CASHIER_IDLE_MS,
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
