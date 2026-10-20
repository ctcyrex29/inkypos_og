import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColors } from '@/ui/theme';

export default function RootLayout() {
  const colors = useColors();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'InkyPOS' }} />
      </Stack>
    </>
  );
}
