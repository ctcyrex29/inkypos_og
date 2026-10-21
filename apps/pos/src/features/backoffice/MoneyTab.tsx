import { EXPENSE_CATEGORIES, PAID_FROM, parseAmount, presetPeriod, type ExpenseCategory, type PaidFrom } from '@inkypos/core';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { m } from './ReportsTab';
import { Chip, describeApiError, styles, useLoad, type BackOfficeApi } from './shared';

type Mode = 'cashbook' | 'expenses' | 'suppliers';
type Preset = 'today' | 'last7' | 'month' | 'lastMonth';

const PAID_FROM_LABEL: Record<PaidFrom, string> = { bank: 'Bank', mobile_money: 'Mobile money', cash_office: 'Office cash', other: 'Other' };
const realNow = () => new Date();

export function MoneyTab({ api, branchId, now = realNow }: { api: BackOfficeApi; branchId: string | null; now?: () => Date }) {
  const [mode, setMode] = useState<Mode>('cashbook');
  const [preset, setPreset] = useState<Preset>('today');
  const period = useMemo(() => presetPeriod(preset, now()), [preset, now]);

  return (
    <>
      <Card>
        <Heading>Money</Heading>
        <Muted>Money paid out of the till drawer is recorded on the till (Shift → cash out). Record other spending here.</Muted>
        <View style={styles.chips}>
          <Chip label="Cash book" selected={mode === 'cashbook'} onPress={() => setMode('cashbook')} />
          <Chip label="Expenses" selected={mode === 'expenses'} onPress={() => setMode('expenses')} />
          <Chip label="Owed to suppliers" selected={mode === 'suppliers'} onPress={() => setMode('suppliers')} />
        </View>
        {mode !== 'suppliers' ? (
          <View style={styles.chips}>
            <Chip label="Today" selected={preset === 'today'} onPress={() => setPreset('today')} />
            <Chip label="Last 7 days" selected={preset === 'last7'} onPress={() => setPreset('last7')} />
            <Chip label="This month" selected={preset === 'month'} onPress={() => setPreset('month')} />
            <Chip label="Last month" selected={preset === 'lastMonth'} onPress={() => setPreset('lastMonth')} />
          </View>
        ) : null}
      </Card>
      {mode === 'cashbook' ? <CashBook api={api} period={period} /> : mode === 'expenses' ? <Expenses api={api} period={period} branchId={branchId} /> : <Owed api={api} />}
    </>
  );
}

function CashBook({ api, period }: { api: BackOfficeApi; period: ReturnType<typeof presetPeriod> }) {
  const colors = useColors();
  const book = useLoad(useCallback(() => api.cashbook(period), [api, period]));
  const b = book.data;
  if (book.error) return <Card><ErrorText>{book.error}</ErrorText></Card>;
  if (!b) return <Card><Muted>Loading…</Muted></Card>;
  return (
    <Card>
      <Heading>Cash book</Heading>
      {b.totals.map((t) => (
        <View key={t.currency} style={styles.row}>
          <Text style={{ flex: 1, color: colors.text, fontWeight: '700' }}>{t.currency}</Text>
          <Text style={{ color: colors.text }}>
            in {m(t.in_minor, t.currency)} · out {m(t.out_minor, t.currency)} · net {m(t.net_minor, t.currency)}
          </Text>
        </View>
      ))}
      {b.entries.length === 0 ? <Muted>Nothing recorded in this period.</Muted> : null}
      {b.entries.map((e, i) => (
        <View key={i} style={[styles.item, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text }}>{e.description}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
              {e.date} · {e.method}
              {e.pending_minor > 0 ? ` · ${m(e.pending_minor, e.currency)} not yet confirmed` : ''}
            </Text>
          </View>
          <Text style={{ color: e.out_minor > 0 ? colors.danger : colors.text }}>
            {e.in_minor > 0 ? `+${m(e.in_minor, e.currency)}` : `-${m(e.out_minor, e.currency)}`}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function Expenses({ api, period, branchId }: { api: BackOfficeApi; period: ReturnType<typeof presetPeriod>; branchId: string | null }) {
  const colors = useColors();
  const list = useLoad(useCallback(() => api.listExpenses(period), [api, period]));
  const [category, setCategory] = useState<ExpenseCategory>('supplies');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('bank');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minor = parseAmount(amount);

  const save = async () => {
    if (!minor || !description.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.recordExpense({
        category, description: description.trim(), currency: 'USD', amount_minor: minor, paid_from: paidFrom,
        ...(branchId ? { branch_id: branchId } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      setDescription('');
      setAmount('');
      setReference('');
      await list.reload();
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <Heading>Record an expense</Heading>
        <View style={styles.chips}>
          {EXPENSE_CATEGORIES.map((c) => (
            <Chip key={c} label={c[0]!.toUpperCase() + c.slice(1)} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
        <Field label="What was it for?" value={description} onChangeText={setDescription} placeholder="e.g. ZESA tokens" />
        <Field label="Amount (USD)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" inputMode="decimal" />
        <Muted>Paid from</Muted>
        <View style={styles.chips}>
          {PAID_FROM.map((p) => (
            <Chip key={p} label={PAID_FROM_LABEL[p]} selected={paidFrom === p} onPress={() => setPaidFrom(p)} />
          ))}
        </View>
        <Field label="Reference (optional)" value={reference} onChangeText={setReference} />
        {amount && !minor ? <ErrorText>Enter an amount above zero, like 12.50.</ErrorText> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Record expense" onPress={() => void save()} busy={busy} disabled={!minor || !description.trim()} />
      </Card>
      <Card>
        <Heading>Expenses</Heading>
        {list.error ? <ErrorText>{list.error}</ErrorText> : null}
        {list.data?.length === 0 ? <Muted>No expenses in this period.</Muted> : null}
        {list.data?.map((e) => (
          <View key={e.id} style={[styles.item, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text }}>{e.description}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                {e.category} · {PAID_FROM_LABEL[e.paid_from]} · {new Date(e.spent_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={{ color: colors.text }}>{m(e.amount_minor, e.currency)}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function Owed({ api }: { api: BackOfficeApi }) {
  const colors = useColors();
  const balances = useLoad(useCallback(() => api.supplierBalances(), [api]));
  const [paying, setPaying] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('bank');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minor = parseAmount(amount);
  const b = balances.data;

  const pay = async () => {
    if (!paying || !minor || !b) return;
    setBusy(true);
    setError(null);
    try {
      await api.paySupplier({ supplier_id: paying.id, currency: b.currency, amount_minor: minor, paid_from: paidFrom, ...(reference.trim() ? { reference: reference.trim() } : {}) });
      setPaying(null);
      setAmount('');
      setReference('');
      await balances.reload();
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (balances.error) return <Card><ErrorText>{balances.error}</ErrorText></Card>;
  if (!b) return <Card><Muted>Loading…</Muted></Card>;
  if (paying) {
    return (
      <Card>
        <Heading>Pay {paying.name}</Heading>
        <Field label={`Amount (${b.currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" inputMode="decimal" />
        <View style={styles.chips}>
          {PAID_FROM.map((p) => (
            <Chip key={p} label={PAID_FROM_LABEL[p]} selected={paidFrom === p} onPress={() => setPaidFrom(p)} />
          ))}
        </View>
        <Field label="Reference (optional)" value={reference} onChangeText={setReference} placeholder="e.g. ZIPIT reference" />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Record payment" onPress={() => void pay()} busy={busy} disabled={!minor} />
        <Button label="Cancel" tone="secondary" onPress={() => setPaying(null)} disabled={busy} />
      </Card>
    );
  }
  return (
    <Card>
      <Heading>Owed to suppliers</Heading>
      <Muted>Deliveries recorded under Goods received, less payments recorded here.</Muted>
      {b.suppliers.length === 0 ? <Muted>No suppliers yet.</Muted> : null}
      {b.suppliers.map((s) => (
        <View key={s.supplier_id} style={[styles.item, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md }}>{s.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
              Delivered {m(s.deliveries_minor, b.currency)} · paid {m(s.paid_minor, b.currency)}
              {s.paid_in_other_currencies.map((o) => ` + ${m(o.amount_minor, o.currency)}`).join('')}
            </Text>
          </View>
          <Text style={{ color: s.balance_minor > 0 ? colors.danger : colors.text, fontWeight: '700' }}>{m(s.balance_minor, b.currency)}</Text>
          <Chip label={`Pay ${s.name}`} selected={false} onPress={() => setPaying({ id: s.supplier_id, name: s.name })} />
        </View>
      ))}
      {b.suppliers.some((s) => s.paid_in_other_currencies.length > 0) ? (
        <Banner tone="warning" title="Some payments were in another currency" body="They are shown beside the supplier but not taken off the balance." />
      ) : null}
    </Card>
  );
}
