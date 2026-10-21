import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" options={{ title: 'InkyPOS' }} />
              <Stack.Screen name="setup" options={{ title: 'Set up till' }} />
              <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
              <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
              <Stack.Screen name="checkout" options={{ title: 'New sale' }} />
              <Stack.Screen name="receipt/[saleId]" options={{ title: 'Receipt' }} />
              <Stack.Screen name="refund/[saleId]" options={{ title: 'Refund' }} />
              <Stack.Screen name="shift" options={{ title: 'Shift' }} />
              <Stack.Screen name="admin" options={{ title: 'Back office' }} />
              <Stack.Screen name="orders" options={{ title: 'Orders' }} />
              <Stack.Screen name="order/[orderId]" options={{ title: 'Order' }} />
              <Stack.Screen name="kitchen" options={{ title: 'Kitchen' }} />
            </Stack>
          </CashierProvider>
        </SyncProvider>
      </SessionProvider>
    </StoreProvider>
  );
}
