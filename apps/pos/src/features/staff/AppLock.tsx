import type { StaffInfo } from '@inkypos/core';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { syncSummary } from '@/features/sync/sync-status';
import { useCashier } from '@/services/cashier-context';
import { useSession } from '@/services/session-context';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { Icon, Pill } from '@/ui/components';
import { fontSize, spacing, useColors } from '@/ui/theme';
import { SignInScreen } from './SignInScreen';

/**
 * Covers the whole app while nobody has unlocked the till. Rendered above the
 * navigator, so a sale in progress stays where it was and the same cashier
 * carries on after their PIN. Needs no internet.
 */
export function AppLock() {
  const colors = useColors();
  const router = useRouter();
  const { status } = useSession();
  const storeState = useLocalStore();
  const sync = useSync();
  const { cashier, remembered, signIn } = useCashier();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const [staff, setStaff] = useState<StaffInfo[] | null>(null);
  // Whoever had the till before it locked: anyone else starts again from the home screen.
  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    if (cashier) lastUser.current = cashier.id;
  }, [cashier]);

  const locked = status?.phase === 'ready' && !cashier;

  useEffect(() => {
    if (!store || !locked) return;
    let cancelled = false;
    void store.staff.listActive().then((list) => !cancelled && setStaff(list));
    return () => {
      cancelled = true;
    };
  }, [store, locked, sync.catalogueRevision]);

  if (!locked) return null;
  const summary = syncSummary(sync, colors);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.hero }]}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <SignInScreen
          staff={staff}
          remembered={remembered}
          signIn={signIn}
          onSignedIn={(person) => {
            if (lastUser.current && person.id !== lastUser.current && router.canDismiss()) router.dismissAll();
          }}
          footer={
            <View style={styles.footer}>
              <Pill label={summary.label} color={summary.online === false ? colors.accent : colors.onHeroMuted} icon={summary.icon} />
              <Text style={{ color: colors.onHeroMuted, fontSize: fontSize.xs, textAlign: 'center' }}>{summary.detail}</Text>
              {staff?.length === 0 || summary.online === false ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Sync now" onPress={() => void sync.syncNow(true)} hitSlop={8} style={styles.sync}>
                  <Icon name="refresh" size={16} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontWeight: '700' }}>{sync.running ? 'Syncing…' : 'Sync now'}</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'center', gap: spacing.xs },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm },
});
