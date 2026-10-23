import type { ApiClient } from '@inkypos/core';
import type { ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';
import { useApiHealth } from './useApiHealth';

interface Props {
  client: ApiClient;
  apiBaseUrl: string;
  appVersion: string;
  /** Device and subscription panel, shown above the connection card once enrolled. */
  children?: ReactNode;
}

/** Foundation screen: proves the shared core, API client and routing work on each platform. */
export function StatusScreen({ client, apiBaseUrl, appVersion, children }: Props) {
  const colors = useColors();
  const { state, recheck } = useApiHealth(client);

  const badge =
    state.kind === 'online'
      ? { label: 'API online', color: colors.success }
      : state.kind === 'offline'
        ? { label: 'API unreachable', color: colors.danger }
        : { label: 'Checking API…', color: colors.warning };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={styles.brand}>
        <Image source={require('../../../assets/inkypos-logo.png')} style={styles.logo} accessibilityLabel="InkyPOS logo" />
        <View>
          <Text style={[styles.title, { color: colors.text }]}>InkyPOS</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>by Inkgenius Technologies · v{appVersion}</Text>
        </View>
      </View>
      {children}

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
  subtitle: { fontSize: fontSize.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // The artwork has a white square background, so it sits on a rounded white tile in dark mode too.
  logo: { width: 64, height: 64, borderRadius: radius.md },
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
