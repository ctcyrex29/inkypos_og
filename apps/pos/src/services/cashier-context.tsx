import { StaffSignIn, tillRoleCan, type SignInResult, type StaffInfo, type TillAction } from '@inkypos/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { CashierSession } from './cashier-session';
import { useLocalStore } from './store-context';
import { useSync } from './sync-context';

const IDLE_CHECK_MS = 15_000;

interface CashierState {
  /** Signed-in staff member, or null. */
  cashier: StaffInfo | null;
  signIn: (userId: string, pin: string) => Promise<SignInResult>;
  signOut: () => void;
  /** Counts as activity for the idle timer; for input that is not a touch (scanners, keyboards). */
  touch: () => void;
  /** False when nobody is signed in. */
  can: (action: TillAction) => boolean;
}

const CashierContext = createContext<CashierState | null>(null);

/**
 * Offline staff sign-in (docs/ARCHITECTURE.md §7). Signs the cashier out after
 * CASHIER_IDLE_MS without a touch, when the app returns from the background
 * after that long, and when a pull deactivates them or changes their PIN or role.
 */
export function CashierProvider({ children, session: given }: { children: ReactNode; session?: CashierSession }) {
  const storeState = useLocalStore();
  const { catalogueRevision } = useSync();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const session = useMemo(() => given ?? new CashierSession(), [given]);
  const [cashier, setCashier] = useState<StaffInfo | null>(session.cashier?.staff ?? null);
  const signer = useMemo(() => (store ? new StaffSignIn(store) : null), [store]);

  const sync = useCallback(() => setCashier(session.cashier?.staff ?? null), [session]);

  const signIn = useCallback(
    async (userId: string, pin: string): Promise<SignInResult> => {
      if (!signer) return { ok: false, reason: 'unknown' };
      const result = await signer.attempt(userId, pin);
      if (result.ok) session.signIn(result.staff);
      sync();
      return result;
    },
    [signer, session, sync],
  );

  const signOut = useCallback(() => {
    session.signOut();
    sync();
  }, [session, sync]);

  useEffect(() => {
    const timer = setInterval(() => session.expireIfIdle() && sync(), IDLE_CHECK_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && session.expireIfIdle()) sync();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [session, sync]);

  // New reference data may have deactivated the signed-in person.
  useEffect(() => {
    const current = session.cashier;
    if (!store || !current) return;
    let cancelled = false;
    void store.staff.get(current.staff.id).then((latest) => {
      if (!cancelled && session.refresh(latest)) sync();
    });
    return () => {
      cancelled = true;
    };
  }, [store, session, sync, catalogueRevision]);

  const touch = useCallback(() => session.touch(), [session]);

  const can = useCallback((action: TillAction) => (cashier ? tillRoleCan(cashier.role, action) : false), [cashier]);

  return (
    <CashierContext.Provider value={{ cashier, signIn, signOut, touch, can }}>
      <View style={{ flex: 1 }} onTouchStart={touch}>
        {children}
      </View>
    </CashierContext.Provider>
  );
}

export function useCashier(): CashierState {
  const value = useContext(CashierContext);
  if (!value) throw new Error('useCashier must be used inside CashierProvider');
  return value;
}
