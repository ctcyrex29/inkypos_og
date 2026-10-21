import { formatMajor, parseAmount, parseQuantity, purchaseLineCost, type BackOfficeProduct, type Supplier } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { Chip, describeApiError, qty, styles, useLoad, usd, type BackOfficeApi } from './shared';

type Mode = 'list' | 'receive' | 'suppliers';
type Line = { product: BackOfficeProduct; quantity: string; cost: string };

/** A line's quantity and cost as entered, or null while either is not yet valid. */
function parsedLine(l: Line): { quantity_milli: number; unit_cost_minor: number } | null {
  const quantity = parseQuantity(l.quantity);
  const cost = parseAmount(l.cost);
  return quantity === null || cost === null ? null : { quantity_milli: quantity, unit_cost_minor: cost };
}

export function PurchasesTab({ api, branchId }: { api: BackOfficeApi; branchId: string | null }) {
  const colors = useColors();
  const [view, setView] = useState<Mode>('list');
  const purchases = useLoad(useCallback(() => api.listPurchases(), [api]));
  const suppliers = useLoad(useCallback(() => api.listSuppliers(), [api]));

  return (
    <>
      <Card>
        <Heading>Goods received</Heading>
        <Muted>Deliveries from suppliers add stock and set each product’s cost.</Muted>
        <View style={styles.chips}>
          <Chip label="Deliveries" selected={view === 'list'} onPress={() => setView('list')} />
          <Chip label="Receive goods" selected={view === 'receive'} onPress={() => setView('receive')} />
          <Chip label="Suppliers" selected={view === 'suppliers'} onPress={() => setView('suppliers')} />
        </View>
      </Card>
      {view === 'suppliers' ? (
        <Suppliers api={api} list={suppliers.data} error={suppliers.error} reload={suppliers.reload} />
      ) : view === 'receive' ? (
        <Receive
          api={api}
          branchId={branchId}
          suppliers={(suppliers.data ?? []).filter((s) => s.active)}
          onDone={async () => {
            await purchases.reload();
            setView('list');
          }}
          onAddSupplier={() => setView('suppliers')}
        />
      ) : (
        <Card>
          {purchases.error ? <ErrorText>{purchases.error}</ErrorText> : null}
          {purchases.data === null ? <Muted>Loading…</Muted> : purchases.data.length === 0 ? <Muted>No deliveries recorded yet.</Muted> : null}
          {purchases.data?.map((p) => (
            <View key={p.id} style={[styles.item, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: fontSize.md }}>{p.supplier_name ?? 'Supplier'}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                  {new Date(p.received_at).toLocaleDateString()}
                  {p.reference ? ` · ${p.reference}` : ''}
                </Text>
              </View>
              <Text style={{ color: colors.text }}>{usd(p.total_cost_minor)}</Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function Receive({
  api,
  branchId,
  suppliers,
  onDone,
  onAddSupplier,
}: {
  api: BackOfficeApi;
  branchId: string | null;
  suppliers: Supplier[];
  onDone: () => Promise<void>;
  onAddSupplier: () => void;
}) {
  const colors = useColors();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<BackOfficeProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) return setFound([]);
    try {
      setFound((await api.listProducts(text.trim())).slice(0, 6));
    } catch (e) {
      setError(describeApiError(e));
    }
  };

  const add = (p: BackOfficeProduct) => {
    if (!lines.some((l) => l.product.product_id === p.product_id)) {
      setLines([...lines, { product: p, quantity: '', cost: p.cost_minor == null ? '' : formatMajor({ amount: p.cost_minor, currency: 'USD' }) }]);
    }
    setSearch('');
    setFound([]);
  };
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const parsed = lines.map(parsedLine);
  const ready = parsed.every((p) => p !== null) && lines.length > 0 && supplierId !== null && branchId !== null;
  const total = parsed.reduce((sum, p) => sum + (p ? purchaseLineCost(p.quantity_milli, p.unit_cost_minor) : 0), 0);

  const save = async () => {
    if (!ready || !supplierId || !branchId) return;
    setBusy(true);
    setError(null);
    try {
      await api.recordPurchase({
        branch_id: branchId,
        supplier_id: supplierId,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        lines: lines.map((l, i) => ({ product_id: l.product.product_id, ...parsed[i]! })),
      });
      await onDone();
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Heading>Receive goods</Heading>
      {!branchId ? <Banner tone="warning" title="Choose a branch first" body="Goods are received into a branch." /> : null}
      {suppliers.length === 0 ? (
        <>
          <Muted>Add the supplier first.</Muted>
          <Button label="Add a supplier" tone="secondary" onPress={onAddSupplier} />
        </>
      ) : (
        <View style={styles.chips}>
          {suppliers.map((s) => (
            <Chip key={s.id} label={s.name} selected={supplierId === s.id} onPress={() => setSupplierId(s.id)} />
          ))}
        </View>
      )}
      <Field label="Invoice or delivery note number" value={reference} onChangeText={setReference} placeholder="optional" />
      <Field label="Add a product" value={search} onChangeText={(t) => void find(t)} autoCapitalize="none" placeholder="Name or SKU" />
      {found.map((p) => (
        <Pressable key={p.product_id} accessibilityRole="button" accessibilityLabel={`Add ${p.name}`} onPress={() => add(p)} style={[styles.item, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text }}>{p.name}</Text>
        </Pressable>
      ))}
      {lines.map((l, i) => {
        const p = parsed[i];
        return (
          <View key={l.product.product_id} style={{ gap: 4, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>{l.product.name}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field
                  label={`Quantity of ${l.product.name}`}
                  value={l.quantity}
                  onChangeText={(t) => update(i, { quantity: t })}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder={l.product.unit === 'each' ? 'items' : l.product.unit}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label={`Unit cost of ${l.product.name}`}
                  value={l.cost}
                  onChangeText={(t) => update(i, { cost: t })}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="USD"
                />
              </View>
            </View>
            <Muted>{p ? `${qty(p.quantity_milli, l.product.unit)} · ${usd(purchaseLineCost(p.quantity_milli, p.unit_cost_minor))}` : 'Enter quantity and cost'}</Muted>
            <Chip label={`Remove ${l.product.name}`} selected={false} onPress={() => setLines(lines.filter((_, j) => j !== i))} />
          </View>
        );
      })}
      {lines.length > 0 ? <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '700' }}>Total {usd(total)}</Text> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Record delivery" onPress={() => void save()} busy={busy} disabled={!ready} />
    </Card>
  );
}

function Suppliers({ api, list, error, reload }: { api: BackOfficeApi; list: Supplier[] | null; error: string | null; reload: () => Promise<void> }) {
  const colors = useColors();
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await api.createSupplier({
        name: form.name.trim(),
        ...(form.contact_person.trim() ? { contact_person: form.contact_person.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setForm({ name: '', contact_person: '', phone: '' });
      await reload();
    } catch (e) {
      setFailed(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s: Supplier) => {
    try {
      await api.updateSupplier(s.id, { active: !s.active });
      await reload();
    } catch (e) {
      setFailed(describeApiError(e));
    }
  };

  return (
    <Card>
      <Heading>Suppliers</Heading>
      <Field label="Supplier name" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
      <Field label="Contact person" value={form.contact_person} onChangeText={(t) => setForm({ ...form, contact_person: t })} placeholder="optional" />
      <Field label="Supplier phone" value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} keyboardType="phone-pad" inputMode="tel" placeholder="optional" />
      <Button label="Add supplier" onPress={() => void add()} busy={busy} disabled={!form.name.trim()} />
      {error || failed ? <ErrorText>{error ?? failed}</ErrorText> : null}
      {list?.map((s) => (
        <View key={s.id} style={[styles.item, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: s.active ? colors.text : colors.textMuted, fontSize: fontSize.md }}>{s.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{[s.contact_person, s.phone].filter(Boolean).join(' · ')}</Text>
          </View>
          <Chip label={s.active ? 'Active' : 'Inactive'} selected={s.active} onPress={() => void toggle(s)} />
        </View>
      ))}
    </Card>
  );
}
