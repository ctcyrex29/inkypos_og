import { StaffSignIn, tillRoleCan, type SignInResult, type StaffInfo, type TillAction } from '@inkypos/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { prefs as devicePrefs } from '@/platform/prefs';
import { CashierSession } from './cashier-session';
import { useLocalStore } from './store-context';
import { useSync } from './sync-context';

const IDLE_CHECK_MS = 15_000;
const REMEMBERED_KEY = 'last_cashier';

interface CashierState {
  /** The person the till is unlocked for, or null while locked. */
  cashier: StaffInfo | null;
  /** Who last unlocked this till (kept across restarts): the lock screen asks for their PIN first. */
  remembered: StaffInfo | null;
  signIn: (userId: string, pin: string) => Promise<SignInResult>;
  /** Locks the till; the same person unlocks it again with just their PIN. */
  lock: () => void;
  /** Locks the till and forgets who it was, so the next person picks their name. */
  signOut: () => void;
  /** Counts as activity for the idle timer; for input that is not a touch (scanners, keyboards). */
  touch: () => void;
  /** False when nobody is signed in. */
  can: (action: TillAction) => boolean;
}

const CashierContext = createContext<CashierState | null>(null);

/**
 * Offline staff sign-in (docs/ARCHITECTURE.md §7), working like a phone app
 * lock: the till remembers who used it last and only asks for their PIN, with
 * no internet needed. It locks after CASHIER_IDLE_MS without a touch, when the
 * app comes back after a minute in the background, on restart, and when a pull
 * deactivates the person or changes their PIN or role.
 */
export function CashierProvider({
  children,
  session: given,
  prefs = devicePrefs,
}: {
  children: ReactNode;
  session?: CashierSession;
  prefs?: { get(key: string): Promise<string | null>; set(key: string, value: string | null): Promise<void> };
}) {
  const storeState = useLocalStore();
  const { catalogueRevision } = useSync();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const session = useMemo(() => given ?? new CashierSession(), [given]);
  const [cashier, setCashier] = useState<StaffInfo | null>(session.cashier?.staff ?? null);
  const [remembered, setRemembered] = useState<StaffInfo | null>(null);
  const signer = useMemo(() => (store ? new StaffSignIn(store) : null), [store]);

  const sync = useCallback(() => setCashier(session.cashier?.staff ?? null), [session]);

  const remember = useCallback(
    (person: StaffInfo | null) => {
      setRemembered(person);
      void prefs.set(REMEMBERED_KEY, person?.id ?? null);
    },
    [prefs],
  );

  // Who used this till last, from the previous run; refreshed when new staff data arrives.
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void (async () => {
      const id = await prefs.get(REMEMBERED_KEY);
      const person = id ? await store.staff.get(id) : null;
      if (cancelled) return;
      setRemembered(person && person.active ? person : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [store, prefs, catalogueRevision]);

  const signIn = useCallback(
    async (userId: string, pin: string): Promise<SignInResult> => {
      if (!signer) return { ok: false, reason: 'unknown' };
      const result = await signer.attempt(userId, pin);
      if (result.ok) {
        session.signIn(result.staff);
        remember(result.staff);
      }
      sync();
      return result;
    },
    [signer, session, sync, remember],
  );

  const lock = useCallback(() => {
    session.signOut();
    sync();
  }, [session, sync]);

  const signOut = useCallback(() => {
    session.signOut();
    remember(null);
    sync();
  }, [session, sync, remember]);

  useEffect(() => {
    const timer = setInterval(() => session.expireIfIdle() && sync(), IDLE_CHECK_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') session.wentToBackground();
      if (next === 'active' && session.cameToForeground()) sync();
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
    <CashierContext.Provider value={{ cashier, remembered, signIn, lock, signOut, touch, can }}>
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
