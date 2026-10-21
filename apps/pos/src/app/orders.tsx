import { formatMajor, type BusinessInfo, type OpenOrder } from '@inkypos/core';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { OrdersScreen } from '@/features/restaurant/OrdersScreen';
import { useCashier } from '@/services/cashier-context';
import { useLocalStore } from '@/services/store-context';
import { startOrder } from '@/services/till-data';

export default function Orders() {
  const router = useRouter();
  const storeState = useLocalStore();
  const { cashier } = useCashier();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const [state, setState] = useState<{ orders: OpenOrder[]; business: BusinessInfo } | null>(null);

  // Reload whenever the screen comes back into view (after paying or editing an order).
  useFocusEffect(
    useCallback(() => {
      if (!store) return;
      let cancelled = false;
      void Promise.all([store.orders.list(), store.reference.business()]).then(([orders, business]) => {
        if (!cancelled && business) setState({ orders, business });
      });
      return () => {
        cancelled = true;
      };
    }, [store]),
  );

  if (!cashier) return <Redirect href={{ pathname: '/sign-in', params: { next: 'orders' } }} />;
  if (!store || !state) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  const currency = state.business.base_currency;
  return (
    <OrdersScreen
      orders={state.orders}
      business={state.business}
      money={(minor) => `${currency} ${formatMajor({ amount: minor, currency })}`}
      onOpen={(orderId) => router.push({ pathname: '/order/[orderId]', params: { orderId } })}
      onCreate={async (serviceType, table) => {
        const order = await startOrder(store, serviceType, table);
        router.push({ pathname: '/order/[orderId]', params: { orderId: order.order_id } });
      }}
    />
  );
}
