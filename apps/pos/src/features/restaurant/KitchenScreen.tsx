import type { OpenOrder } from '@inkypos/core';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Heading, Muted } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';
import { where } from './OrdersScreen';

const ACTION: Partial<Record<OpenOrder['status'], string>> = { sent: 'Start preparing', preparing: 'Mark ready', ready: 'Mark served' };

/**
 * The kitchen's view of this till's orders: what has been sent, in the order
 * it arrived, with one tap to move each order on. Ready orders are called out
 * in large numbers for the counter.
 */
export function KitchenScreen({ orders, onAdvance }: { orders: OpenOrder[]; onAdvance: (order: OpenOrder) => void }) {
  const colors = useColors();
  const active = orders.filter((o) => o.status === 'sent' || o.status === 'preparing' || o.status === 'ready');
  const ready = active.filter((o) => o.status === 'ready');

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Card>
        <Heading>Ready for collection</Heading>
        {ready.length === 0 ? <Muted>Nothing waiting.</Muted> : null}
        <View style={styles.callouts}>
          {ready.map((o) => (
            <View key={o.order_id} accessibilityRole="text" accessibilityLabel={`Order ${o.order_number} is ready`} style={[styles.callout, { borderColor: colors.success }]}>
              <Text style={{ color: colors.success, fontSize: 48, fontWeight: '800' }}>{o.order_number}</Text>
              <Text style={{ color: colors.text }}>{where(o)}</Text>
            </View>
          ))}
        </View>
      </Card>
      {active.length === 0 ? (
        <Card>
          <Muted>No orders in the kitchen.</Muted>
        </Card>
      ) : null}
      <View style={styles.tickets}>
        {active.map((o) => (
          <View key={o.order_id} style={[styles.ticket, { backgroundColor: colors.surface, borderColor: o.status === 'ready' ? colors.success : o.status === 'preparing' ? colors.warning : colors.border }]}>
            <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: '800' }}>
              {o.order_number} · {where(o)}
            </Text>
            <Text style={{ color: colors.textMuted }}>since {new Date(o.updated_at).toLocaleTimeString([], { timeStyle: 'short' })}</Text>
            {o.lines
              .filter((l) => o.sent_line_ids.includes(l.line_id))
              .map((l) => (
                <View key={l.line_id}>
                  <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '700' }}>
                    {l.product.unit === 'each' ? `${l.quantity_milli / 1000} × ` : ''}
                    {l.product.name}
                  </Text>
                  {l.options?.length ? <Text style={{ color: colors.text }}>{l.options.map((x) => x.name).join(', ')}</Text> : null}
                  {l.note ? <Text style={{ color: colors.danger, fontWeight: '700' }}>Note: {l.note}</Text> : null}
                </View>
              ))}
            {ACTION[o.status] ? <Button label={`${ACTION[o.status]} (order ${o.order_number})`} onPress={() => onAdvance(o)} /> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, width: '100%' },
  callouts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  callout: { borderWidth: 3, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, alignItems: 'center' },
  tickets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  ticket: { borderWidth: 3, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, minWidth: 260, flexBasis: 260, flexGrow: 1 },
});
