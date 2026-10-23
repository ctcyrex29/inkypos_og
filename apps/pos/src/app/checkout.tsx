import { canStartSale, cartForOrder, type Cart } from '@inkypos/core';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { CheckoutScreen, type CheckoutServices } from '@/features/checkout/CheckoutScreen';
import { newId } from '@/services/api';
import { useCashier } from '@/services/cashier-context';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { completeSale, loadCheckoutData, payOrder } from '@/services/till-data';
import { Banner, Button } from '@/ui/components';

type Data = NonNullable<Awaited<ReturnType<typeof loadCheckoutData>>>;

export default function Checkout() {
  const router = useRouter();
  // Paying a restaurant order: ?order=<id>&lines=<id,id> (all of it when lines is absent),
  // optionally &split=<people> to split it evenly on this one sale.
  const params = useLocalSearchParams<{ order?: string; lines?: string; split?: string }>();
  const orderId = params.order ?? null;
  const splitWays = orderId && params.split ? Math.min(20, Math.max(2, Number.parseInt(params.split, 10) || 2)) : undefined;
  const [orderCart, setOrderCart] = useState<Cart | null | 'gone'>(null);
  const storeState = useLocalStore();
  const { status } = useSession();
  const sync = useSync();
  const { cashier, touch } = useCashier();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const device = status?.phase === 'ready' ? status.device : null;
  const [data, setData] = useState<Data | null | 'missing'>(null);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!store) return;
    void loadCheckoutData(store).then((d) => setData(d ?? 'missing'));
    void store.shifts.current().then((s) => setShiftOpen(s !== null));
  }, [store, sync.catalogueRevision]);

  useEffect(() => {
    if (!store || !orderId || !data || data === 'missing') return;
    let cancelled = false;
    void store.orders.get(orderId).then((order) => {
      if (cancelled) return;
      if (!order) return setOrderCart('gone');
      try {
        setOrderCart(cartForOrder(order, data.business, params.lines ? params.lines.split(',') : undefined));
      } catch {
        setOrderCart('gone');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store, orderId, data, params.lines]);

  const services = useMemo<CheckoutServices | null>(() => {
    if (!store || !device || !cashier || !data || data === 'missing') return null;
    return {
      business: data.business,
      paymentMethods: data.paymentMethods,
      rateFor: (quote) => data.rates.get(quote) ?? null,
      // Scanning and searching count as activity, so a scanner-only cashier is not signed out mid-sale.
      findByBarcode: (code) => (touch(), store.catalogue.findByBarcode(code)),
      search: (text) => (touch(), store.catalogue.search(text, 8)),
      newId,
      complete: async (cart) => {
        touch();
        const saleId = orderId ? await payOrder(store, device, cashier, orderId, cart) : await completeSale(store, device, cashier, cart);
        void sync.syncNow();
        return saleId;
      },
      cameraAvailable: Platform.OS !== 'web',
      categories: () => store.catalogue.categories(),
      inCategory: (categoryId) => (touch(), store.catalogue.inCategory(categoryId, 60)),
      searchCustomers: (text) => (touch(), store.customers.search(text, 6)),
    };
  }, [store, device, cashier, touch, data, sync, orderId]);

  if (!cashier) return <Redirect href={{ pathname: '/sign-in', params: { next: 'checkout' } }} />;
  if (status?.phase === 'ready' && !canStartSale(status.entitlement)) {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="danger" title="Selling is paused" body="See the main screen for the reason. Sales already made still sync." />
      </View>
    );
  }
  if (shiftOpen === false) {
    return (
      <View style={{ padding: 24, gap: 16 }}>
        <Banner tone="warning" title="No shift is open" body="Count the cash drawer and open a shift before selling." />
        <Button label="Open a shift" onPress={() => router.replace('/shift')} />
      </View>
    );
  }
  if (data === 'missing') {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="warning" title="Catalogue not downloaded yet" body="Connect to the internet and tap Sync now on the main screen." />
      </View>
    );
  }
  if (orderId && orderCart === 'gone') {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="warning" title="That order is no longer open" body="It may have been paid already." />
      </View>
    );
  }
  if (!services || (orderId && orderCart === null)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <CheckoutScreen
      services={services}
      onCompleted={(saleId) => router.replace(`/receipt/${saleId}`)}
      {...(orderId && orderCart && orderCart !== 'gone' ? { initialCart: orderCart, itemsLocked: true, splitWays } : {})}
    />
  );
}
