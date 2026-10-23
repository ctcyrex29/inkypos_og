import { formatMajor, sendToKitchen, type BusinessInfo, type OpenOrder } from '@inkypos/core';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { OrderScreen, type OrderServices } from '@/features/restaurant/OrderScreen';
import { newId } from '@/services/api';
import { useCashier } from '@/services/cashier-context';
import { printDocument } from '@/services/printer';
import { useLocalStore } from '@/services/store-context';
import { kitchenTicketDocument } from '@/services/till-data';
import { Banner } from '@/ui/components';

export default function Order() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const storeState = useLocalStore();
  const { cashier, touch } = useCashier();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const [state, setState] = useState<{ order: OpenOrder; business: BusinessInfo } | 'missing' | null>(null);

  useEffect(() => {
    if (!store || !orderId) return;
    let cancelled = false;
    void Promise.all([store.orders.get(orderId), store.reference.business()]).then(([order, business]) => {
      if (!cancelled) setState(order && business ? { order, business } : 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [store, orderId]);

  const services = useMemo<OrderServices | null>(() => {
    if (!store || !state || state === 'missing') return null;
    const currency = state.business.base_currency;
    return {
      business: state.business,
      money: (minor) => `${currency} ${formatMajor({ amount: minor, currency })}`,
      newId,
      search: (text) => (touch(), store.catalogue.search(text, 8)),
      categories: () => store.catalogue.categories(),
      inCategory: (categoryId) => (touch(), store.catalogue.inCategory(categoryId, 60)),
      // The kitchen screen owns the status; keep whatever it has set since this screen loaded.
      save: async (order) => {
        touch();
        const current = await store.orders.get(order.order_id);
        await store.orders.save(current ? { ...order, status: current.status } : order);
      },
      send: async (order) => {
        touch();
        const current = await store.orders.get(order.order_id);
        const latest = current ? { ...order, status: current.status } : order;
        const extra = latest.sent_line_ids.length > 0;
        const { order: sent, ticket } = sendToKitchen(latest, new Date());
        await store.orders.save(sent);
        // The order is sent even if printing fails or is cancelled; the kitchen screen shows it too.
        try {
          await printDocument(store, 'kitchen', await kitchenTicketDocument(store, sent, ticket, extra), `Order ${sent.order_number}`);
          return { order: sent };
        } catch (e) {
          return { order: sent, printError: (e as Error).message };
        }
      },
      pay: (order, lineIds, splitWays) =>
        router.push({
          pathname: '/checkout',
          params: { order: order.order_id, ...(lineIds ? { lines: lineIds.join(',') } : {}), ...(splitWays ? { split: String(splitWays) } : {}) },
        }),
    };
  }, [store, state, touch, router]);

  if (!cashier) return <Redirect href={{ pathname: '/sign-in', params: { next: 'orders' } }} />;
  if (state === 'missing') {
    return (
      <View style={{ padding: 24 }}>
        <Banner tone="warning" title="That order is no longer open" body="It may have been paid already." />
      </View>
    );
  }
  if (!services || !state) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <OrderScreen order={state.order} services={services} />;
}
