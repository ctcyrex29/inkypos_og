import { ScrollView, StyleSheet, Text } from 'react-native';
import type { DeviceRecord } from '@/services/device-session';
import { Banner, Card, Muted } from '@/ui/components';
import { fontSize, spacing, useColors } from '@/ui/theme';

/** Shown once the server reports this device revoked. No sale can start from here. */
export function LockedScreen({ device, unsynced }: { device: DeviceRecord; unsynced: number | null }) {
  const colors = useColors();
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>Till locked</Text>
      <Card>
        <Banner tone="danger" title="This device was revoked" body="A manager removed this till from the business. It can no longer sign in or sell." />
        {unsynced ? (
          <Banner
            tone="warning"
            title={`${unsynced} sale${unsynced === 1 ? '' : 's'} never reached the server`}
            body="Do not reset or uninstall this app. A manager can recover these sales with a recovery export."
          />
        ) : null}
        <Muted>
          If this was a mistake, ask a manager to contact InkyPOS support. Device {device.device_id}.
        </Muted>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: '700' },
});
