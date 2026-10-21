import { parseQuantity, type StockAdjustmentInput, type StockAdjustmentReason, type StockLedgerEntry, type StockLevel } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { Chip, describeApiError, qty, styles, useLoad, usd, type BackOfficeApi } from './shared';

const REASONS: { reason: StockAdjustmentReason; label: string; help: string }[] = [
  { reason: 'intake', label: 'Stock intake', help: 'Stock received without a supplier delivery note (use Goods received for supplier deliveries).' },
  { reason: 'damage', label: 'Damaged or expired', help: 'Removes stock that can no longer be sold.' },
  { reason: 'correction', label: 'Correction', help: 'Adds or removes stock to fix a known mistake.' },
  { reason: 'count', label: 'Stock count', help: 'Enter what is on the shelf; the difference is recorded.' },
];

const LEDGER_LABEL: Record<string, string> = {
  sale: 'Sold', refund: 'Returned', purchase: 'Received', intake: 'Intake', damage: 'Damaged', correction: 'Correction', count: 'Stock count',
};

/** Parses "3", "2.5" or "0" (zero only makes sense for a count). */
function parseQty(text: string): number | null {
  return text.trim() === '0' ? 0 : parseQuantity(text);
}

export function StockTab({ api, branchId }: { api: BackOfficeApi; branchId: string | null }) {
  const colors = useColors();
  const [lowOnly, setLowOnly] = useState(false);
  const levels = useLoad(useCallback(() => api.stockLevels({ ...(branchId ? { branchId } : {}), lowOnly }), [api, branchId, lowOnly]));
  const [selected, setSelected] = useState<StockLevel | null>(null);
  const [ledger, setLedger] = useState<StockLedgerEntry[] | null>(null);
  const [reason, setReason] = useState<StockAdjustmentReason>('intake');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const open = async (item: StockLevel) => {
    setSelected(item);
    setAmount('');
    setNote('');
    setError(null);
    setDone(null);
    setLedger(null);
    try {
      setLedger(await api.stockMovements(item.product_id));
    } catch (e) {
      setError(describeApiError(e));
    }
  };

  const save = async () => {
    if (!selected || !branchId) return;
    const milli = parseQty(amount);
    if (milli === null || (milli === 0 && reason !== 'count')) return setError('Enter a quantity, e.g. 12 or 2.5');
    const body: StockAdjustmentInput =
      reason === 'count'
        ? { branch_id: branchId, product_id: selected.product_id, reason, counted_milli: milli, ...(note.trim() ? { note: note.trim() } : {}) }
        : {
            branch_id: branchId,
            product_id: selected.product_id,
            reason,
            quantity_delta_milli: reason === 'intake' ? milli : reason === 'damage' ? -milli : direction * milli,
            ...(note.trim() ? { note: note.trim() } : {}),
          };
    setBusy(true);
    setError(null);
    try {
      const result = await api.adjustStock(body);
      setDone(`Recorded. ${selected.name} now has ${qty(result.on_hand_milli, selected.unit)} on hand.`);
      setAmount('');
      setNote('');
      setLedger(await api.stockMovements(selected.product_id));
      await levels.reload();
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (selected) {
    const current = levels.data?.items.find((i) => i.product_id === selected.product_id) ?? selected;
    const help = REASONS.find((r) => r.reason === reason)!.help;
    return (
      <Card>
        <Heading>{current.name}</Heading>
        <Muted>
          {qty(current.on_hand_milli, current.unit)} on hand
          {current.reorder_level_milli !== null ? ` · low at ${qty(current.reorder_level_milli, current.unit)}` : ''}
        </Muted>
        {!branchId ? <Banner tone="warning" title="Choose a branch first" body="Stock is recorded per branch." /> : null}
        <View style={styles.chips}>
          {REASONS.map((r) => (
            <Chip key={r.reason} label={r.label} selected={reason === r.reason} onPress={() => setReason(r.reason)} />
          ))}
        </View>
        <Muted>{help}</Muted>
        {reason === 'correction' ? (
          <View style={styles.chips}>
            <Chip label="Add stock" selected={direction === 1} onPress={() => setDirection(1)} />
            <Chip label="Remove stock" selected={direction === -1} onPress={() => setDirection(-1)} />
          </View>
        ) : null}
        <Field
          label={reason === 'count' ? `Counted (${current.unit === 'each' ? 'items' : current.unit})` : `Quantity (${current.unit === 'each' ? 'items' : current.unit})`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
        <Field label="Note (optional)" value={note} onChangeText={setNote} />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {done ? <Muted>{done}</Muted> : null}
        <Button label="Record" onPress={() => void save()} busy={busy} disabled={!amount.trim() || !branchId} />
        <Button label="Back to stock list" tone="secondary" onPress={() => setSelected(null)} disabled={busy} />
        <Heading>History</Heading>
        {ledger === null ? <Muted>Loading…</Muted> : ledger.length === 0 ? <Muted>No movements yet.</Muted> : null}
        {ledger?.map((m) => (
          <View key={m.id} style={[styles.item, { borderColor: colors.border }]}>
            <Text style={{ flex: 1, color: colors.text }}>
              {LEDGER_LABEL[m.reason] ?? m.reason} · {new Date(m.occurred_at).toLocaleDateString()}
              {m.note ? ` · ${m.note}` : ''}
            </Text>
            <Text style={{ color: m.quantity_delta_milli < 0 ? colors.danger : colors.text }}>
              {m.quantity_delta_milli > 0 ? '+' : ''}
              {qty(m.quantity_delta_milli, current.unit)}
            </Text>
          </View>
        ))}
      </Card>
    );
  }

  const items = levels.data?.items ?? [];
  return (
    <Card>
      <Heading>Stock</Heading>
      {levels.data ? <Muted>Stock value at last cost: {usd(levels.data.total_value_minor)}</Muted> : null}
      <View style={styles.chips}>
        <Chip label="All products" selected={!lowOnly} onPress={() => setLowOnly(false)} />
        <Chip label="Low stock" selected={lowOnly} onPress={() => setLowOnly(true)} />
      </View>
      {levels.error ? <ErrorText>{levels.error}</ErrorText> : null}
      {levels.data === null ? <Muted>Loading…</Muted> : items.length === 0 ? <Muted>{lowOnly ? 'Nothing is low.' : 'No products.'}</Muted> : null}
      {items.map((i) => (
        <Pressable
          key={i.product_id}
          accessibilityRole="button"
          accessibilityLabel={`Stock for ${i.name}`}
          onPress={() => void open(i)}
          style={[styles.item, { borderColor: colors.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: i.active ? colors.text : colors.textMuted, fontSize: fontSize.md }}>{i.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
              {i.sku}
              {i.value_minor !== null ? ` · worth ${usd(i.value_minor)}` : ''}
            </Text>
          </View>
          <Text style={{ color: i.low ? colors.danger : colors.text, fontWeight: i.low ? '700' : '400' }}>
            {qty(i.on_hand_milli, i.unit)}
            {i.low ? ' · low' : ''}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}
