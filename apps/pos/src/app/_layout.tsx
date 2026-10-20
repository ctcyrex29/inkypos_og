import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '@/services/session-context';
import { StoreProvider } from '@/services/store-context';
import { useColors } from '@/ui/theme';

export default function RootLayout() {
  const colors = useColors();
  return (
    <StoreProvider>
      <SessionProvider>
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
        </Stack>
      </SessionProvider>
    </StoreProvider>
  );
}
