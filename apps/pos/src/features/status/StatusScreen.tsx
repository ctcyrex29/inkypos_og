import type { ApiClient } from '@inkypos/core';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';
import { useApiHealth } from './useApiHealth';

interface Props {
  client: ApiClient;
  apiBaseUrl: string;
  appVersion: string;
}

/** Foundation screen: proves the shared core, API client and routing work on each platform. */
export function StatusScreen({ client, apiBaseUrl, appVersion }: Props) {
  const colors = useColors();
  const { state, recheck } = useApiHealth(client);

  const badge =
    state.kind === 'online'
      ? { label: 'API online', color: colors.success }
      : state.kind === 'offline'
        ? { label: 'API unreachable', color: colors.danger }
        : { label: 'Checking API…', color: colors.warning };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>InkyPOS</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Foundation build · v{appVersion}</Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: badge.color }]} />
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text }]}>
            {badge.label}
          </Text>
        </View>
        <Detail label="Endpoint" value={apiBaseUrl} />
        <Detail label="Platform" value={Platform.OS} />
        {state.kind === 'online' && (
          <>
            <Detail label="API version" value={state.health.api_version} />
            <Detail label="Server time" value={state.health.server_time} />
            <Detail label="Latency" value={`${state.latencyMs} ms`} />
          </>
        )}
        {state.kind === 'offline' && <Detail label={state.code} value={state.message} />}
        <Pressable
          accessibilityRole="button"
          onPress={() => void recheck()}
          disabled={state.kind === 'checking'}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed || state.kind === 'checking' ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>Check again</Text>
        </Pressable>
      </View>
    </ScrollView>
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
  container: { padding: spacing.xl, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: fontSize.xxl, fontWeight: '700' },
  subtitle: { fontSize: fontSize.md, marginTop: -spacing.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '600' },
  detail: { gap: 2 },
  detailLabel: { fontSize: fontSize.sm },
  detailValue: { fontSize: fontSize.md },
  button: { marginTop: spacing.sm, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  buttonLabel: { fontSize: fontSize.md, fontWeight: '600' },
});
