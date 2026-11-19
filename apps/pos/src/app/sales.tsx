import { formatMajor, type LocalSale } from '@inkypos/core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SYNC_LABELS } from '@/features/sync/SyncPanel';
import { useLocalStore } from '@/services/store-context';
import { useSync } from '@/services/sync-context';
import { Card, Icon, ListRow, Pill, Screen } from '@/ui/components';
import { spacing, useColors } from '@/ui/theme';

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** The latest sales on this till; tap one for its receipt, reprint or refund. */
export default function Sales() {
  const router = useRouter();
  const colors = useColors();
  const storeState = useLocalStore();
  const { counts } = useSync();
  const store = storeState.phase === 'ready' ? storeState.store : null;
  const [sales, setSales] = useState<LocalSale[] | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void store.sales.listRecent(50).then((list) => !cancelled && setSales(list));
    return () => {
      cancelled = true;
    };
  }, [store, counts]);

  return (
    <Screen>
      <Card style={{ paddingVertical: spacing.sm }}>
        {sales === null ? <ActivityIndicator color={colors.primary} /> : null}
        {sales?.length === 0 ? (
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Icon name="receipt-outline" size={32} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted }}>No sales on this till yet.</Text>
          </View>
        ) : null}
        {sales?.map((s) => (
          <ListRow
            key={s.sale.sale_id}
            icon="receipt-outline"
            title={`${s.sale.currency} ${formatMajor({ amount: s.sale.totals.total_minor, currency: s.sale.currency })}`}
            subtitle={`${s.sale.receipt_number} · ${when(s.sale.completed_at)}`}
            right={<Pill label={SYNC_LABELS[s.sync_state]} color={s.sync_state === 'synced' ? colors.success : s.sync_state === 'needs_review' ? colors.danger : colors.warning} />}
            onPress={() => router.push(`/receipt/${s.sale.sale_id}`)}
          />
        ))}
      </Card>
    </Screen>
  );
}
