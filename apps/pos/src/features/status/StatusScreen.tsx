import type { ApiClient } from '@inkypos/core';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Icon } from '@/ui/components';
import { fontSize, spacing, useColors } from '@/ui/theme';
import { useApiHealth } from './useApiHealth';

interface Props {
  client: ApiClient;
  apiBaseUrl: string;
  appVersion: string;
  /** Shown above the connection card. */
  children?: ReactNode;
}

/** Whether the InkyPOS server can be reached from this phone, with the details support asks for. */
export function StatusScreen({ client, apiBaseUrl, appVersion, children }: Props) {
  const colors = useColors();
  const { state, recheck } = useApiHealth(client);

  const badge =
    state.kind === 'online'
      ? { label: 'API online', color: colors.success, icon: 'cloud-done' as const }
      : state.kind === 'offline'
        ? { label: 'API unreachable', color: colors.danger, icon: 'cloud-offline' as const }
        : { label: 'Checking API…', color: colors.warning, icon: 'cloud-outline' as const };

  return (
    <View style={styles.wrap}>
      {children}
      <Card>
        <View style={styles.row}>
          <Icon name={badge.icon} size={24} color={badge.color} />
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text }]}>
            {badge.label}
          </Text>
        </View>
        {state.kind === 'offline' ? (
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>You can keep selling offline. Sales are saved on this phone and send when the connection is back.</Text>
        ) : null}
        <Detail label="Server" value={apiBaseUrl} />
        {state.kind === 'online' && (
          <>
            <Detail label="API version" value={state.health.api_version} />
            <Detail label="Server time" value={state.health.server_time} />
            <Detail label="Response time" value={`${state.latencyMs} ms`} />
          </>
        )}
        {state.kind === 'offline' && <Detail label={state.code} value={state.message} />}
        <Detail label="App" value={`v${appVersion} · ${Platform.OS}`} />
        <Button label="Check again" icon="refresh" tone="secondary" onPress={() => void recheck()} disabled={state.kind === 'checking'} />
      </Card>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.detail}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text selectable style={[styles.detailValue, { color: colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailLabel: { fontSize: fontSize.sm },
  detailValue: { fontSize: fontSize.sm, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
