import {
  cashVariance,
  formatMajor,
  parseAmount,
  type CashMovementPayload,
  type CurrencyAmount,
  type CurrencyCode,
  type ShiftRecord,
} from '@inkypos/core';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';

export interface ShiftSummaryView {
  shift: ShiftRecord;
  expected: CurrencyAmount[];
  activity: { sales: unknown[]; refunds: unknown[]; movements: CashMovementPayload[] };
}

interface Props {
  summary: ShiftSummaryView | null;
  /** Cash currencies the drawer holds. */
  currencies: CurrencyCode[];
  onOpen: (float: CurrencyAmount[]) => Promise<void>;
  onCash: (input: Pick<CashMovementPayload, 'direction' | 'currency' | 'amount_minor' | 'reason'> & { note?: string }) => Promise<void>;
  onClose: (counted: CurrencyAmount[], note?: string) => Promise<void>;
  /** Prints the open shift so far (X report). */
  onPrintCurrent?: () => Promise<void>;
  /** Prints the last closed shift (Z report); absent when there is none. */
  onPrintLast?: (() => Promise<void>) | null;
}

const money = (r: CurrencyAmount) => `${r.currency} ${formatMajor({ amount: r.amount_minor, currency: r.currency })}`;
const REASONS: { value: CashMovementPayload['reason']; label: string }[] = [
  { value: 'safe_drop', label: 'Safe drop' },
  { value: 'float_top_up', label: 'Float top-up' },
  { value: 'expense', label: 'Expense' },
  { value: 'other', label: 'Other' },
];

/** Reads one amount per currency; null if any entered value is not a valid amount. */
function amounts(values: Record<string, string>, currencies: CurrencyCode[]): CurrencyAmount[] | null {
  const rows: CurrencyAmount[] = [];
  for (const currency of currencies) {
    const text = (values[currency] ?? '').trim();
    const minor = text === '' ? 0 : parseAmount(text);
    if (minor === null) return null;
    rows.push({ currency, amount_minor: minor });
  }
  return rows;
}

export function ShiftScreen({ summary, currencies, onOpen, onCash, onClose, onPrintCurrent, onPrintLast }: Props) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [floatText, setFloatText] = useState<Record<string, string>>({});
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [closeNote, setCloseNote] = useState('');
  const [cash, setCash] = useState<{ direction: 'in' | 'out'; currency: CurrencyCode; amount: string; reason: CashMovementPayload['reason']; note: string }>({
    direction: 'out',
    currency: currencies[0] ?? 'USD',
    amount: '',
    reason: 'safe_drop',
    note: '',
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!summary) {
    const float = amounts(floatText, currencies);
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
        <Card>
          <Heading>Open a shift</Heading>
          <Muted>Count the cash in the drawer before the first sale.</Muted>
          {currencies.map((c) => (
            <Field key={c} label={`Opening float (${c})`} value={floatText[c] ?? ''} onChangeText={(t) => setFloatText({ ...floatText, [c]: t })} keyboardType="decimal-pad" inputMode="decimal" placeholder="0.00" />
          ))}
          {!float ? <ErrorText>Enter amounts like 50 or 50.00.</ErrorText> : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label="Open shift" onPress={() => float && void run(() => onOpen(float))} busy={busy} disabled={!float} />
          {onPrintLast ? <Button label="Print last shift report" tone="secondary" onPress={() => void run(onPrintLast)} disabled={busy} /> : null}
        </Card>
      </ScrollView>
    );
  }

  const countedRows = amounts(counted, currencies);
  const variance = countedRows && Object.values(counted).some((v) => v.trim() !== '') ? cashVariance(summary.expected, countedRows) : null;
  const cashAmount = parseAmount(cash.amount);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Card>
        <Heading>Shift open</Heading>
        <Muted>Since {new Date(summary.shift.opened_at).toLocaleString()} · {summary.activity.sales.length} sales · {summary.activity.refunds.length} refunds</Muted>
        <Text style={[styles.label, { color: colors.textMuted }]}>Cash expected in the drawer</Text>
        {summary.expected.length === 0 ? <Muted>No cash yet.</Muted> : summary.expected.map((r) => <Text key={r.currency} style={[styles.big, { color: colors.text }]}>{money(r)}</Text>)}
      </Card>

      <Card>
        <Heading>Cash in or out</Heading>
        <View style={styles.chips}>
          <Chip label="Take out" selected={cash.direction === 'out'} onPress={() => setCash({ ...cash, direction: 'out' })} />
          <Chip label="Put in" selected={cash.direction === 'in'} onPress={() => setCash({ ...cash, direction: 'in' })} />
        </View>
        <View style={styles.chips}>
          {currencies.map((c) => <Chip key={c} label={c} selected={cash.currency === c} onPress={() => setCash({ ...cash, currency: c })} />)}
        </View>
        <View style={styles.chips}>
          {REASONS.map((r) => <Chip key={r.value} label={r.label} selected={cash.reason === r.value} onPress={() => setCash({ ...cash, reason: r.value })} />)}
        </View>
        <Field label={`Amount (${cash.currency})`} value={cash.amount} onChangeText={(t) => setCash({ ...cash, amount: t })} keyboardType="decimal-pad" inputMode="decimal" />
        <Field label="Note (optional)" value={cash.note} onChangeText={(t) => setCash({ ...cash, note: t })} />
        <Button
          label={cash.direction === 'out' ? 'Record cash taken out' : 'Record cash put in'}
          tone="secondary"
          busy={busy}
          disabled={!cashAmount}
          onPress={() =>
            cashAmount &&
            void run(async () => {
              await onCash({ direction: cash.direction, currency: cash.currency, amount_minor: cashAmount, reason: cash.reason, ...(cash.note ? { note: cash.note } : {}) });
              setCash({ ...cash, amount: '', note: '' });
            })
          }
        />
      </Card>

      <Card>
        <Heading>Close shift</Heading>
        <Muted>Count the drawer and enter what is there.</Muted>
        {currencies.map((c) => (
          <Field key={c} label={`Counted (${c})`} value={counted[c] ?? ''} onChangeText={(t) => setCounted({ ...counted, [c]: t })} keyboardType="decimal-pad" inputMode="decimal" placeholder="0.00" />
        ))}
        {variance
          ? variance.map((v) => (
              <Banner
                key={v.currency}
                tone={v.amount_minor === 0 ? 'success' : 'warning'}
                title={v.amount_minor === 0 ? `${v.currency} balances` : `${v.currency} ${v.amount_minor > 0 ? 'over' : 'short'} by ${formatMajor({ amount: Math.abs(v.amount_minor), currency: v.currency })}`}
              />
            ))
          : null}
        <Field label="Note (optional)" value={closeNote} onChangeText={setCloseNote} />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Close shift" busy={busy} disabled={!countedRows} onPress={() => countedRows && void run(() => onClose(countedRows, closeNote.trim() || undefined))} />
        {onPrintCurrent ? <Button label="Print shift so far" tone="secondary" onPress={() => void run(onPrintCurrent)} disabled={busy} /> : null}
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
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  label: { fontSize: fontSize.sm, marginTop: spacing.sm },
  big: { fontSize: fontSize.xl, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
