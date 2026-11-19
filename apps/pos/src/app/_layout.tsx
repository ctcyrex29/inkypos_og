import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppLock } from '@/features/staff/AppLock';
import { CashierProvider } from '@/services/cashier-context';
import { SessionProvider } from '@/services/session-context';
import { StoreProvider } from '@/services/store-context';
import { SyncProvider } from '@/services/sync-context';
import { useColors } from '@/ui/theme';

export default function RootLayout() {
  const colors = useColors();
  return (
    <StoreProvider>
      <SessionProvider>
        <SyncProvider>
          <CashierProvider>
            <StatusBar style="auto" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '700' },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false, title: 'InkyPOS' }} />
              <Stack.Screen name="setup" options={{ headerShown: false, title: 'Set up till' }} />
              <Stack.Screen name="sync" options={{ title: 'Sync and connection' }} />
              <Stack.Screen name="sales" options={{ title: 'Recent sales' }} />
              <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
              <Stack.Screen name="printer" options={{ title: 'Printer' }} />
              <Stack.Screen name="sign-in" options={{ headerShown: false, title: 'Sign in' }} />
              <Stack.Screen name="checkout" options={{ title: 'New sale' }} />
              <Stack.Screen name="receipt/[saleId]" options={{ title: 'Receipt' }} />
              <Stack.Screen name="refund/[saleId]" options={{ title: 'Refund' }} />
              <Stack.Screen name="shift" options={{ title: 'Shift and cash drawer' }} />
              <Stack.Screen name="orders" options={{ title: 'Orders' }} />
              <Stack.Screen name="order/[orderId]" options={{ title: 'Order' }} />
              <Stack.Screen name="kitchen" options={{ title: 'Kitchen' }} />
            </Stack>
            {/* Above every screen: nothing on the till is reachable until someone unlocks it. */}
            <AppLock />
          </CashierProvider>
        </SyncProvider>
      </SessionProvider>
    </StoreProvider>
  );
}
