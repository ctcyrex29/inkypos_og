import { formatMajor, type LocalSale, type LocalSyncState, type SyncRunResult } from '@inkypos/core';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, Heading, Muted } from '@/ui/components';
import { fontSize, radius, spacing, useColors, type Colors } from '@/ui/theme';

export const SYNC_LABELS: Record<LocalSyncState, string> = {
  local: 'Saved on till',
  pending: 'Waiting to sync',
  synced: 'Synced',
  needs_review: 'Needs review',
};

const tone = (state: LocalSyncState, colors: Colors) =>
  ({ local: colors.textMuted, pending: colors.warning, synced: colors.success, needs_review: colors.danger })[state];

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function lastRunMessage(lastRun: { at: string; result: SyncRunResult } | null): string {
  if (!lastRun) return 'Not synced yet this session.';
  const { result, at } = lastRun;
  if (result.stoppedBy === 'idle') return `Last synced at ${time(at)}.`;
  if (result.stoppedBy === 'not_enrolled') return 'This till is not registered.';
  if (result.stoppedBy === 'backoff') return 'Waiting to retry after an earlier failed attempt. Tap Sync now to try immediately.';
  return `Last attempt at ${time(at)} could not finish (${result.error?.code ?? result.stoppedBy}). It will retry automatically.`;
}

interface Props {
  counts: Record<LocalSyncState, number> | null;
  recent: LocalSale[];
  lastRun: { at: string; result: SyncRunResult } | null;
  running: boolean;
  onSyncNow: () => void;
  onRecordSample?: (() => void) | null;
}

export function SyncPanel({ counts, recent, lastRun, running, onSyncNow, onRecordSample }: Props) {
  const colors = useColors();
  const waiting = counts ? counts.local + counts.pending : 0;

  return (
    <Card>
      <Heading>Sales sync</Heading>
      {counts && counts.needs_review > 0 ? (
        <Banner
          tone="danger"
          title={`${counts.needs_review} sale${counts.needs_review === 1 ? '' : 's'} need review`}
          body="The server stored them but a manager must check them. They stay on this till."
        />
      ) : null}
      <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '600' }}>
        {waiting === 0 ? 'Everything is synced' : `${waiting} sale${waiting === 1 ? '' : 's'} waiting to sync`}
      </Text>
      <Muted>{lastRunMessage(lastRun)}</Muted>
      <Button label="Sync now" onPress={onSyncNow} busy={running} />
      {onRecordSample ? <Button label="Record sample sale (dev only)" tone="secondary" onPress={onRecordSample} /> : null}

      {recent.length > 0 ? (
        <View style={styles.list}>
          {recent.map((s) => (
            <View key={s.sale.sale_id} style={[styles.sale, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: fontSize.md }}>{s.sale.receipt_number}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                  #{s.device_sequence} · {time(s.sale.completed_at)}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: fontSize.md }}>
                {s.sale.currency} {formatMajor({ amount: s.sale.totals.total_minor, currency: s.sale.currency })}
              </Text>
              <Text style={[styles.badge, { color: tone(s.sync_state, colors), borderColor: tone(s.sync_state, colors) }]}>
                {SYNC_LABELS[s.sync_state]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, marginTop: spacing.sm },
  sale: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, paddingTop: spacing.sm },
  badge: { fontSize: fontSize.sm, fontWeight: '600', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
});
