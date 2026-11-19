import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useCashier } from '@/services/cashier-context';
import { useColors } from '@/ui/theme';

/** Where a signed-in cashier may be sent back to; anything else goes home. */
const NEXT_ROUTES = { checkout: '/checkout', diagnostics: '/diagnostics', shift: '/shift', orders: '/orders' } as const;

/**
 * Screens that need a cashier send people here. The lock screen (AppLock, over
 * every screen) does the asking; once someone has unlocked, carry on.
 */
export default function SignIn() {
  const { next, saleId } = useLocalSearchParams<{ next?: string; saleId?: string }>();
  const { cashier } = useCashier();
  const colors = useColors();

  if (!cashier) return <View style={{ flex: 1, backgroundColor: colors.hero }} />;
  if (next === 'refund' && saleId) return <Redirect href={{ pathname: '/refund/[saleId]', params: { saleId } }} />;
  return <Redirect href={NEXT_ROUTES[next as keyof typeof NEXT_ROUTES] ?? '/'} />;
}
