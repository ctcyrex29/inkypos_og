import { advanceOrder, type OpenOrder } from '@inkypos/core';
import { useEffect, useState } from 'react';
import { KitchenScreen } from '@/features/restaurant/KitchenScreen';
import { useLocalStore } from '@/services/store-context';

const REFRESH_MS = 5_000;

/** Kitchen display for this till's orders. Needs no sign-in: it only moves orders along. */
export default function Kitchen() {
  const storeState = useLocalStore();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [tick, setTick] = useState(0);

  // Orders are taken on another screen of this till; look again every few seconds.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void store.orders.list().then((list) => !cancelled && setOrders(list));
    return () => {
      cancelled = true;
    };
  }, [store, tick]);

  return (
    <KitchenScreen
      orders={orders}
      onAdvance={async (order) => {
        if (!store) return;
        // Re-read first: the order may have changed (items added, part paid) since it was shown.
        const current = await store.orders.get(order.order_id);
        if (current) await store.orders.save(advanceOrder(current, new Date()));
        setTick((t) => t + 1);
      }}
    />
  );
}
