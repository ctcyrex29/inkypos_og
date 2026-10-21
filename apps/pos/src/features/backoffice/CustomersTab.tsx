import { formatMajor, type BackOfficeCustomer, type CustomerHistory, type CustomerInput } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { Chip, describeApiError, styles, useLoad, usd, type BackOfficeApi } from './shared';

type Form = { name: string; phone: string; email: string; notes: string; active: boolean };
const EMPTY: Form = { name: '', phone: '', email: '', notes: '', active: true };
const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

export function CustomersTab({ api }: { api: BackOfficeApi }) {
  const colors = useColors();
  const [search, setSearch] = useState('');
  const customers = useLoad(useCallback(() => api.listCustomers(search.trim()), [api, search]));
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (c: BackOfficeCustomer) => {
    setEditing({ id: c.id, form: { name: c.name, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '', active: c.active } });
    setHistory(null);
    try {
      setHistory(await api.customerHistory(c.id));
    } catch (e) {
      setError(describeApiError(e));
    }
  };

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) return setError('Enter the customer’s name.');
    const input: CustomerInput = { name: f.name.trim(), phone: orNull(f.phone), email: orNull(f.email), notes: orNull(f.notes), active: f.active };
    setBusy(true);
    setError(null);
    try {
      if (editing.id) await api.updateCustomer(editing.id, input);
      else await api.createCustomer(input);
      setEditing(null);
      await customers.reload();
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const f = editing.form;
    const set = (patch: Partial<Form>) => setEditing({ ...editing, form: { ...f, ...patch } });
    return (
      <Card>
        <Heading>{editing.id ? f.name : 'New customer'}</Heading>
        <Field label="Name" value={f.name} onChangeText={(t) => set({ name: t })} />
        <Field label="Phone" value={f.phone} onChangeText={(t) => set({ phone: t })} keyboardType="phone-pad" inputMode="tel" placeholder="+263 77 123 4567" />
        <Field label="Email" value={f.email} onChangeText={(t) => set({ email: t })} keyboardType="email-address" inputMode="email" autoCapitalize="none" />
        <Field label="Notes" value={f.notes} onChangeText={(t) => set({ notes: t })} multiline />
        <View style={styles.chips}>
          <Chip label={f.active ? 'Active' : 'Inactive'} selected={f.active} onPress={() => set({ active: !f.active })} />
        </View>
        <Muted>Tills receive the name and phone only, to find the customer at checkout.</Muted>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Save customer" onPress={() => void save()} busy={busy} />
        <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} disabled={busy} />
        {history ? (
          <>
            <Heading>Purchases</Heading>
            <Muted>
              {history.sales_count} {history.sales_count === 1 ? 'sale' : 'sales'} · {usd(history.sales_total_minor)} in total
            </Muted>
            {history.recent_sales.map((s) => (
              <View key={s.sale_id} style={[styles.item, { borderColor: colors.border }]}>
                <Text style={{ flex: 1, color: colors.text }}>
                  {s.receipt_number} · {new Date(s.completed_at).toLocaleDateString()}
                </Text>
                <Text style={{ color: colors.text }}>
                  {s.currency} {formatMajor({ amount: s.total_minor, currency: s.currency })}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <Heading>Customers</Heading>
      <Field label="Search" value={search} onChangeText={setSearch} autoCapitalize="none" placeholder="Name or phone" />
      <Button label="New customer" onPress={() => setEditing({ id: null, form: EMPTY })} />
      {customers.error || error ? <ErrorText>{customers.error ?? error}</ErrorText> : null}
      {customers.data === null ? <Muted>Loading…</Muted> : customers.data.length === 0 ? <Muted>No customers.</Muted> : null}
      {customers.data?.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${c.name}`}
          onPress={() => void open(c)}
          style={[styles.item, { borderColor: colors.border }]}
        >
          <Text style={{ flex: 1, color: c.active ? colors.text : colors.textMuted, fontSize: fontSize.md }}>{c.name}</Text>
          <Text style={{ color: colors.textMuted }}>{c.phone ?? ''}</Text>
        </Pressable>
      ))}
    </Card>
  );
}
