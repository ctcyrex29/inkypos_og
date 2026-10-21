import type { StaffInfo } from '@inkypos/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SignInScreen } from '@/features/staff/SignInScreen';
import { useCashier } from '@/services/cashier-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';

/** Where a signed-in cashier may be sent back to; anything else goes home. */
const NEXT_ROUTES = { checkout: '/checkout', diagnostics: '/diagnostics', shift: '/shift' } as const;

export default function SignIn() {
  const { next, saleId } = useLocalSearchParams<{ next?: string; saleId?: string }>();
  const router = useRouter();
  const storeState = useLocalStore();
  const { catalogueRevision } = useSync();
  const { signIn } = useCashier();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const [staff, setStaff] = useState<StaffInfo[] | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void store.staff.listActive().then((list) => !cancelled && setStaff(list));
    return () => {
      cancelled = true;
    };
  }, [store, catalogueRevision]);

  return (
    <SignInScreen
      staff={staff}
      signIn={signIn}
      onSignedIn={() =>
        next === 'refund' && saleId
          ? router.replace({ pathname: '/refund/[saleId]', params: { saleId } })
          : router.replace(NEXT_ROUTES[next as keyof typeof NEXT_ROUTES] ?? '/')
      }
    />
  );
}
