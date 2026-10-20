import {
  ApiError,
  formatMajor,
  parseAmount,
  type ApiClient,
  type CatalogueProduct,
  type ExchangeRateInfo,
  type PaymentMethodInfo,
  type ProductInput,
  type Unit,
} from '@inkypos/core';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';

/** The back-office calls this screen uses; a manager-token ApiClient satisfies it. */
export type BackOfficeApi = Pick<
  ApiClient,
  'listProducts' | 'createProduct' | 'updateProduct' | 'listPaymentMethods' | 'updatePaymentMethod' | 'listExchangeRates' | 'setExchangeRate'
>;

type Tab = 'products' | 'payments' | 'rates';

export function describeApiError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'network_error' || e.code === 'timeout') return 'Cannot reach the InkyPOS server. Back office changes need a connection.';
    if (e.code === 'forbidden') return 'Only an owner or manager can change this.';
    const first = e.details ? Object.values(e.details)[0]?.[0] : undefined;
    return first ?? e.message;
  }
  return (e as Error).message;
}

export function BackOfficeScreen({ api, businessName, onSignOut }: { api: BackOfficeApi; businessName: string; onSignOut: () => void }) {
  const colors = useColors();
  const [tab, setTab] = useState<Tab>('products');
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>Back office · {businessName}</Heading>
        <Muted>Changes reach every till on its next sync.</Muted>
        <View style={styles.chips}>
          <Chip label="Products" selected={tab === 'products'} onPress={() => setTab('products')} />
          <Chip label="Payment types" selected={tab === 'payments'} onPress={() => setTab('payments')} />
          <Chip label="Exchange rates" selected={tab === 'rates'} onPress={() => setTab('rates')} />
        </View>
        <Button label="Sign out" tone="secondary" onPress={onSignOut} />
      </Card>
      {tab === 'products' ? <Products api={api} /> : tab === 'payments' ? <PaymentTypes api={api} /> : <Rates api={api} />}
    </ScrollView>
  );
}

// ── Products ──────────────────────────────────────────────────────────────

const EMPTY: Form = { sku: '', name: '', price: '', unit: 'each', tax_code: 'VAT15', tax_rate: '15', tax_inclusive: true, active: true, barcodes: '' };
type Form = { sku: string; name: string; price: string; unit: Unit; tax_code: string; tax_rate: string; tax_inclusive: boolean; active: boolean; barcodes: string };

function toForm(p: CatalogueProduct): Form {
  return {
    sku: p.sku, name: p.name, price: formatMajor({ amount: p.unit_price_minor, currency: 'USD' }), unit: p.unit, tax_code: p.tax_code,
    tax_rate: String(p.tax_rate_bp / 100), tax_inclusive: p.tax_inclusive, active: p.active, barcodes: p.barcodes.join(', '),
  };
}

function toInput(f: Form): ProductInput | string {
  const price = parseAmount(f.price);
  if (price === null) return 'Enter the price like 1.20';
  const rate = Number(f.tax_rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return 'Tax rate must be a percentage, e.g. 15';
  if (!f.sku.trim() || !f.name.trim()) return 'SKU and name are required';
  return {
    sku: f.sku.trim(), name: f.name.trim(), unit_price_minor: price, unit: f.unit, tax_code: f.tax_code.trim() || 'VAT',
    tax_rate_bp: Math.round(rate * 100), tax_inclusive: f.tax_inclusive, active: f.active,
    barcodes: f.barcodes.split(/[\s,]+/).map((b) => b.trim()).filter(Boolean),
  };
}

function Products({ api }: { api: BackOfficeApi }) {
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.listProducts(search.trim()), [api, search]);
  useEffect(() => {
    let cancelled = false;
    void load().then((p) => !cancelled && setProducts(p), (e) => !cancelled && setError(describeApiError(e)));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const save = async () => {
    if (!editing) return;
    const input = toInput(editing.form);
    if (typeof input === 'string') return setError(input);
    setBusy(true);
    setError(null);
    try {
      if (editing.id) await api.updateProduct(editing.id, input);
      else await api.createProduct(input);
      setEditing(null);
      setProducts(await load());
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
        <Heading>{editing.id ? `Edit ${f.name}` : 'New product'}</Heading>
        <Field label="Name" value={f.name} onChangeText={(t) => set({ name: t })} />
        <Field label="SKU" value={f.sku} onChangeText={(t) => set({ sku: t })} autoCapitalize="characters" />
        <Field label={`Price (USD${f.unit === 'each' ? '' : ` per ${f.unit}`})`} value={f.price} onChangeText={(t) => set({ price: t })} keyboardType="decimal-pad" inputMode="decimal" />
        <View style={styles.chips}>
          {(['each', 'kg', 'l'] as Unit[]).map((u) => <Chip key={u} label={u === 'each' ? 'Sold per item' : `Sold per ${u}`} selected={f.unit === u} onPress={() => set({ unit: u })} />)}
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Tax code" value={f.tax_code} onChangeText={(t) => set({ tax_code: t })} autoCapitalize="characters" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Tax rate (%)" value={f.tax_rate} onChangeText={(t) => set({ tax_rate: t })} keyboardType="decimal-pad" inputMode="decimal" />
          </View>
        </View>
        <View style={styles.chips}>
          <Chip label="Tax included in price" selected={f.tax_inclusive} onPress={() => set({ tax_inclusive: !f.tax_inclusive })} />
          <Chip label={f.active ? 'For sale' : 'Not for sale'} selected={f.active} onPress={() => set({ active: !f.active })} />
        </View>
        <Field label="Barcodes (comma separated)" value={f.barcodes} onChangeText={(t) => set({ barcodes: t })} autoCapitalize="none" />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Save product" onPress={() => void save()} busy={busy} />
        <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} disabled={busy} />
      </Card>
    );
  }

  return (
    <Card>
      <Heading>Products</Heading>
      <Field label="Search" value={search} onChangeText={setSearch} autoCapitalize="none" placeholder="Name or SKU" />
      <Button label="New product" onPress={() => setEditing({ id: null, form: EMPTY })} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {products === null ? <Muted>Loading…</Muted> : products.length === 0 ? <Muted>No products.</Muted> : null}
      {products?.map((p) => (
        <Pressable key={p.product_id} accessibilityRole="button" accessibilityLabel={`Edit ${p.name}`} onPress={() => setEditing({ id: p.product_id, form: toForm(p) })} style={[styles.item, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md }}>{p.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
              {p.sku} · {p.barcodes.join(', ') || 'no barcode'}
            </Text>
          </View>
          <Text style={{ color: p.active ? colors.text : colors.textMuted }}>
            USD {formatMajor({ amount: p.unit_price_minor, currency: 'USD' })}
            {p.unit !== 'each' ? `/${p.unit}` : ''}
            {p.active ? '' : ' · off'}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}

// ── Payment types ─────────────────────────────────────────────────────────

function PaymentTypes({ api }: { api: BackOfficeApi }) {
  const colors = useColors();
  const [methods, setMethods] = useState<PaymentMethodInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.listPaymentMethods().then((m) => !cancelled && setMethods(m), (e) => !cancelled && setError(describeApiError(e)));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const toggle = async (m: PaymentMethodInfo) => {
    try {
      const updated = await api.updatePaymentMethod(m.id, { active: !m.active });
      setMethods((all) => all?.map((x) => (x.id === m.id ? updated : x)) ?? null);
    } catch (e) {
      setError(describeApiError(e));
    }
  };

  return (
    <Card>
      <Heading>Payment types</Heading>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {methods?.map((m) => (
        <View key={m.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>{m.name}</Text>
            <Muted>
              {m.currencies.join(' / ')}
              {m.initial_status === 'pending_confirmation' ? ' · recorded as awaiting confirmation' : ''}
            </Muted>
          </View>
          <Chip label={m.active ? 'On' : 'Off'} selected={m.active} onPress={() => void toggle(m)} />
        </View>
      ))}
    </Card>
  );
}

// ── Exchange rates ────────────────────────────────────────────────────────

/** "1 USD = 27 ZWG" → the stored rate, USD per ZWG, to 8 decimals. */
export function rateFromQuotePerBase(text: string): string | null {
  const perBase = Number(text.replace(',', '.'));
  if (!Number.isFinite(perBase) || perBase <= 0) return null;
  const rate = (1 / perBase).toFixed(8);
  return Number(rate) > 0 ? rate : null;
}

function Rates({ api }: { api: BackOfficeApi }) {
  const [rates, setRates] = useState<ExchangeRateInfo[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.listExchangeRates().then((r) => !cancelled && setRates(r), (e) => !cancelled && setError(describeApiError(e)));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const current = rates?.find((r) => r.quote_currency === 'ZWG');
  const rate = rateFromQuotePerBase(text);

  const save = async () => {
    if (!rate) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.setExchangeRate('ZWG', rate);
      setRates((all) => [created, ...(all ?? [])]);
      setSaved(`Saved: 1 ZWG = ${created.rate} USD (version ${created.version}).`);
      setText('');
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Heading>ZWG exchange rate</Heading>
      {current ? (
        <Muted>
          Current: 1 USD = {(1 / Number(current.rate)).toFixed(2)} ZWG (stored as {current.rate} USD per ZWG, version {current.version})
        </Muted>
      ) : (
        <Banner tone="warning" title="No ZWG rate set" body="Tills cannot take ZWG until a rate is set." />
      )}
      <Field label="ZWG per 1 USD" value={text} onChangeText={setText} keyboardType="decimal-pad" inputMode="decimal" placeholder="e.g. 27" />
      {text && !rate ? <ErrorText>Enter a positive number, e.g. 27 or 26.95</ErrorText> : null}
      {rate ? <Muted>Will store 1 ZWG = {rate} USD.</Muted> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? <Muted>{saved}</Muted> : null}
      <Button label="Set new rate" onPress={() => void save()} busy={busy} disabled={!rate} />
    </Card>
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
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, paddingTop: spacing.sm },
});
