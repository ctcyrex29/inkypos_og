import Constants from 'expo-constants';
import { canStartSale, hasRestaurant } from '@inkypos/core';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeScreen } from '@/features/home/HomeScreen';
import { LockedScreen } from '@/features/status/LockedScreen';
import { syncSummary } from '@/features/sync/sync-status';
import { backOfficeUrl } from '@/services/api';
import { useCashier } from '@/services/cashier-context';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { useColors } from '@/ui/theme';

export default function Index() {
  const { session, status, reload } = useSession();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sync = useSync();
  const { cashier, lock, signOut, can } = useCashier();
  const enrolled = status?.phase === 'ready';
  const storeState = useLocalStore();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  // Restaurants get orders and the kitchen screen; the setting arrives with the catalogue.
  const [business, setBusiness] = useState<{ name: string; restaurant: boolean } | null>(null);
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void store.reference.business().then((b) => !cancelled && setBusiness(b ? { name: b.name, restaurant: hasRestaurant(b.business_type) } : null));
    return () => {
      cancelled = true;
    };
  }, [store, sync.catalogueRevision]);

  // The navy header runs under the status bar: light icons while this screen is in front.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  // Best effort: refresh the signed entitlement whenever the server is reachable.
  useEffect(() => {
    if (!enrolled) return;
    void session
      .refreshEntitlement()
      .catch(() => undefined)
      .finally(() => void reload());
  }, [enrolled, session, reload]);

  if (!status) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (status.phase === 'unenrolled') return <Redirect href="/setup" />;
  if (status.phase === 'revoked') {
    return <LockedScreen device={status.device} unsynced={sync.counts ? sync.counts.local + sync.counts.pending + sync.counts.needs_review : null} />;
  }

  const restaurant = business?.restaurant ?? false;
  return (
    <HomeScreen
      topInset={insets.top}
      cashier={cashier}
      businessName={business?.name ?? null}
      deviceName={status.device.name}
      entitlement={status.entitlement}
      canSell={canStartSale(status.entitlement)}
      restaurant={restaurant}
      sync={syncSummary(sync, colors)}
      recent={sync.recent}
      appVersion={Constants.expoConfig?.version ?? 'dev'}
      actions={{
        newSale: () => router.push('/checkout'),
        orders: restaurant ? () => router.push('/orders') : null,
        kitchen: restaurant ? () => router.push('/kitchen') : null,
        shift: () => router.push('/shift'),
        sales: () => router.push('/sales'),
        sync: () => router.push('/sync'),
        // The back office is the web app (apps/web); it opens in the browser.
        backOffice: () => void Linking.openURL(backOfficeUrl()),
        printer: can('printer_settings') ? () => router.push('/printer') : null,
        diagnostics: can('view_diagnostics') ? () => router.push('/diagnostics') : null,
        openSale: (saleId) => router.push(`/receipt/${saleId}`),
        lock,
        switchUser: signOut,
      }}
    />
  );
}
