import { emptyCart, priceCart, type BusinessInfo, type OpenOrder, type ServiceType } from '@inkypos/core';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';

export const STATUS_LABEL: Record<OpenOrder['status'], string> = {
  open: 'Not sent',
  sent: 'Sent to kitchen',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
};

export const where = (o: Pick<OpenOrder, 'service_type' | 'table'>) => (o.service_type === 'takeaway' ? 'Takeaway' : o.table ? `Table ${o.table}` : 'Sit-in');

/** Open orders on this till, and starting a new one. */
export function OrdersScreen({
  orders,
  business,
  money,
  onOpen,
  onCreate,
}: {
  orders: OpenOrder[];
  business: Pick<BusinessInfo, 'base_currency' | 'rounding'>;
  money: (minor: number) => string;
  onOpen: (orderId: string) => void;
  onCreate: (serviceType: ServiceType, table: string | null) => Promise<void>;
}) {
  const colors = useColors();
  const [table, setTable] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (serviceType: ServiceType) => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(serviceType, serviceType === 'sit_in' ? table.trim() || null : null);
      setTable('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const total = (o: OpenOrder) => priceCart({ ...emptyCart(business), lines: o.lines }).total;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>New order</Heading>
        <Field label="Table (sit-in)" value={table} onChangeText={setTable} placeholder="e.g. 4" maxLength={20} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button label="Sit-in order" onPress={() => void create('sit_in')} busy={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Takeaway order" tone="secondary" onPress={() => void create('takeaway')} disabled={busy} />
          </View>
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Card>
      <Card>
        <Heading>Open orders</Heading>
        {orders.length === 0 ? <Muted>No open orders.</Muted> : null}
        <View style={styles.grid}>
          {orders.map((o) => (
            <Pressable
              key={o.order_id}
              accessibilityRole="button"
              accessibilityLabel={`Order ${o.order_number}, ${where(o)}`}
              onPress={() => onOpen(o.order_id)}
              style={({ pressed }) => [styles.tile, { borderColor: o.status === 'ready' ? colors.success : colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: '700' }}>{o.order_number}</Text>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{where(o)}</Text>
              <Text style={{ color: o.status === 'ready' ? colors.success : colors.textMuted }}>{STATUS_LABEL[o.status]}</Text>
              <Text style={{ color: colors.textMuted }}>
                {o.lines.length} {o.lines.length === 1 ? 'item' : 'items'} · {money(total(o))}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { borderWidth: 2, borderRadius: radius.lg, padding: spacing.md, minWidth: 150, flexBasis: 150, flexGrow: 1, gap: 2 },
});
