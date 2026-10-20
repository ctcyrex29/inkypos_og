import {
  buildRefund,
  formatMajor,
  parseQuantity,
  RefundError,
  refundableLines,
  type PaymentMethodInfo,
  type RefundIssuedPayload,
  type RefundSelection,
  type SaleCompletedPayload,
} from '@inkypos/core';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';

type Reason = RefundIssuedPayload['reason'];
const REASONS: { value: Reason; label: string }[] = [
  { value: 'customer_return', label: 'Customer return' },
  { value: 'price_adjustment', label: 'Price adjustment' },
  { value: 'other', label: 'Other' },
];

interface Props {
  sale: SaleCompletedPayload;
  previous: RefundIssuedPayload[];
  /** Payment types money can go out through (cash first). */
  payoutMethods: PaymentMethodInfo[];
  newId: () => string;
  onRefund: (selections: RefundSelection[], reason: Reason, payoutCode: string, note?: string) => Promise<void>;
  onVoid: (payoutCode: string, note?: string) => Promise<void>;
}

export function RefundScreen({ sale, previous, payoutMethods, newId, onRefund, onVoid }: Props) {
  const colors = useColors();
  const lines = useMemo(() => refundableLines(sale, previous), [sale, previous]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<Reason>('customer_return');
  const [payout, setPayout] = useState(payoutMethods[0]?.code ?? 'cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (minor: number) => `${sale.currency} ${formatMajor({ amount: minor, currency: sale.currency })}`;
  const left = lines.filter((l) => l.refundableMilli > 0);

  const selections: RefundSelection[] = lines.flatMap((l) => {
    const text = (quantities[l.line.line_id] ?? '').trim();
    if (!text) return [];
    const milli = parseQuantity(text);
    return milli ? [{ original_line_id: l.line.line_id, quantity_milli: milli, restock: restock[l.line.line_id] ?? true }] : [];
  });

  // Live preview with the same rule the till and server enforce.
  let preview: { total: number } | { error: string } | null = null;
  if (selections.length > 0) {
    try {
      const built = buildRefund(sale, previous, selections, {
        newId, tenantId: newId(), branchId: newId(), registerId: newId(), deviceId: newId(), actorId: newId(),
        payoutMethodCode: payout, reason, now: () => new Date(),
      });
      preview = { total: built.payload.totals.total_minor };
    } catch (e) {
      preview = { error: e instanceof RefundError ? e.message : (e as Error).message };
    }
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (left.length === 0) {
    return (
      <View style={styles.container}>
        <Banner tone="warning" title="Nothing left to refund" body={`Receipt ${sale.receipt_number} has been fully refunded.`} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>Refund from {sale.receipt_number}</Heading>
        <Muted>Enter how many of each item came back.</Muted>
        {lines.map(({ line, refundableMilli, refundedMilli }) => (
          <View key={line.line_id} style={[styles.line, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontSize: fontSize.md }}>{line.name}</Text>
            <Muted>
              Sold {line.quantity_milli / 1000} for {money(line.line_total_minor)}
              {refundedMilli > 0 ? ` · ${refundedMilli / 1000} already refunded` : ''}
            </Muted>
            {refundableMilli > 0 ? (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={`Return (up to ${refundableMilli / 1000})`}
                    value={quantities[line.line_id] ?? ''}
                    onChangeText={(t) => setQuantities({ ...quantities, [line.line_id]: t })}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </View>
                <Chip
                  label={(restock[line.line_id] ?? true) ? 'Back to stock' : 'Not restocked'}
                  selected={restock[line.line_id] ?? true}
                  onPress={() => setRestock({ ...restock, [line.line_id]: !(restock[line.line_id] ?? true) })}
                />
              </View>
            ) : (
              <Muted>Fully refunded</Muted>
            )}
          </View>
        ))}
      </Card>

      <Card>
        <Heading>Reason and payout</Heading>
        <View style={styles.chips}>
          {REASONS.map((r) => <Chip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />)}
        </View>
        <View style={styles.chips}>
          {payoutMethods.map((m) => <Chip key={m.code} label={`Pay out by ${m.name}`} selected={payout === m.code} onPress={() => setPayout(m.code)} />)}
        </View>
        <Field label="Note (optional)" value={note} onChangeText={setNote} />
        {preview && 'total' in preview ? <Text style={[styles.total, { color: colors.text }]}>Refund {money(preview.total)}</Text> : null}
        {preview && 'error' in preview ? <ErrorText>{preview.error}</ErrorText> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          label="Refund selected items"
          busy={busy}
          disabled={!preview || !('total' in preview)}
          onPress={() => void run(() => onRefund(selections, reason, payout, note.trim() || undefined))}
        />
        <Button label="Void whole sale" tone="secondary" busy={busy} onPress={() => void run(() => onVoid(payout, note.trim() || undefined))} />
      </Card>
    </ScrollView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  line: { borderTopWidth: 1, paddingTop: spacing.sm, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  total: { fontSize: fontSize.lg, fontWeight: '700' },
});
