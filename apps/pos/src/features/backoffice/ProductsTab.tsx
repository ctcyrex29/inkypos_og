import { formatMajor, parseAmount, parseQuantity, type BackOfficeProduct, type CategoryInfo, type ProductInput, type Unit } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { fromDrafts, OptionsEditor, toDrafts, type GroupDraft } from './OptionsEditor';
import { RecipeEditor } from './RecipeEditor';
import { Chip, describeApiError, qty, styles, useLoad, usd, type BackOfficeApi } from './shared';

type Form = {
  sku: string;
  name: string;
  price: string;
  unit: Unit;
  tax_code: string;
  tax_rate: string;
  tax_inclusive: boolean;
  active: boolean;
  barcodes: string;
  category_id: string | null;
  cost: string;
  reorder: string;
  /** Counted as stock (false for dishes made to order). */
  track_stock?: boolean;
  groups?: GroupDraft[];
};

const EMPTY: Form = {
  sku: '', name: '', price: '', unit: 'each', tax_code: 'VAT15', tax_rate: '15', tax_inclusive: true, active: true, barcodes: '',
  category_id: null, cost: '', reorder: '', track_stock: true, groups: [],
};

const major = (minor: number) => formatMajor({ amount: minor, currency: 'USD' });

function toForm(p: BackOfficeProduct): Form {
  return {
    sku: p.sku, name: p.name, price: major(p.unit_price_minor), unit: p.unit, tax_code: p.tax_code, tax_rate: String(p.tax_rate_bp / 100),
    tax_inclusive: p.tax_inclusive, active: p.active, barcodes: p.barcodes.join(', '), category_id: p.category_id ?? null,
    cost: p.cost_minor == null ? '' : major(p.cost_minor), reorder: p.reorder_level_milli == null ? '' : qty(p.reorder_level_milli),
    track_stock: p.track_stock ?? true, groups: toDrafts(p.option_groups),
  };
}

export function toInput(f: Form, original?: BackOfficeProduct): ProductInput | string {
  const price = parseAmount(f.price);
  if (price === null) return 'Enter the price like 1.20';
  const rate = Number(f.tax_rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return 'Tax rate must be a percentage, e.g. 15';
  if (!f.sku.trim() || !f.name.trim()) return 'SKU and name are required';
  const cost = f.cost.trim() === '' ? null : parseAmount(f.cost);
  if (cost === null && f.cost.trim() !== '') return 'Enter the cost like 0.95, or leave it empty';
  const reorder = f.reorder.trim() === '' ? null : f.reorder.trim() === '0' ? 0 : parseQuantity(f.reorder);
  if (reorder === null && f.reorder.trim() !== '') return 'Enter the low-stock level as a quantity, e.g. 5 or 2.5';
  const groups = f.groups ? fromDrafts(f.groups, original?.option_groups) : undefined;
  if (typeof groups === 'string') return groups;
  return {
    sku: f.sku.trim(), name: f.name.trim(), unit_price_minor: price, unit: f.unit, tax_code: f.tax_code.trim() || 'VAT',
    tax_rate_bp: Math.round(rate * 100), tax_inclusive: f.tax_inclusive, active: f.active,
    barcodes: f.barcodes.split(/[\s,]+/).map((b) => b.trim()).filter(Boolean),
    category_id: f.category_id, cost_minor: cost, reorder_level_milli: reorder,
    ...(f.track_stock === undefined ? {} : { track_stock: f.track_stock }),
    ...(groups ? { option_groups: groups } : {}),
  };
}

export function ProductsTab({ api }: { api: BackOfficeApi }) {
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const products = useLoad(useCallback(() => api.listProducts(search.trim(), filter ?? undefined), [api, search, filter]));
  const categories = useLoad(useCallback(() => api.listCategories(), [api]));
  const [editing, setEditing] = useState<{ id: string | null; form: Form; original?: BackOfficeProduct } | null>(null);
  const [recipeFor, setRecipeFor] = useState<BackOfficeProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const active: CategoryInfo[] = (categories.data ?? []).filter((c) => c.active);
  const categoryName = (id: string | null | undefined) => active.find((c) => c.id === id)?.name;

  const save = async () => {
    if (!editing) return;
    const input = toInput(editing.form, editing.original);
    if (typeof input === 'string') return setError(input);
    setBusy(true);
    setError(null);
    try {
      const saved = editing.id ? await api.updateProduct(editing.id, input) : await api.createProduct(input);
      setEditing({ id: saved.product_id, form: toForm(saved), original: saved });
      setSaved(true);
      await products.reload();
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (recipeFor) return <RecipeEditor api={api} product={recipeFor} onDone={() => setRecipeFor(null)} />;

  if (editing) {
    const f = editing.form;
    const set = (patch: Partial<Form>) => {
      setSaved(false);
      setEditing({ ...editing, form: { ...f, ...patch } });
    };
    const per = f.unit === 'each' ? '' : ` per ${f.unit}`;
    return (
      <Card>
        <Heading>{editing.id ? `Edit ${f.name}` : 'New product'}</Heading>
        <Field label="Name" value={f.name} onChangeText={(t) => set({ name: t })} />
        <Field label="SKU" value={f.sku} onChangeText={(t) => set({ sku: t })} autoCapitalize="characters" />
        <Field label={`Price (USD${per})`} value={f.price} onChangeText={(t) => set({ price: t })} keyboardType="decimal-pad" inputMode="decimal" />
        <View style={styles.chips}>
          {(['each', 'kg', 'l'] as Unit[]).map((u) => (
            <Chip key={u} label={u === 'each' ? 'Sold per item' : `Sold per ${u}`} selected={f.unit === u} onPress={() => set({ unit: u })} />
          ))}
        </View>
        {active.length > 0 ? (
          <>
            <Muted>Category</Muted>
            <View style={styles.chips}>
              <Chip label="No category" selected={f.category_id === null} onPress={() => set({ category_id: null })} />
              {active.map((c) => (
                <Chip key={c.id} label={c.name} selected={f.category_id === c.id} onPress={() => set({ category_id: c.id })} />
              ))}
            </View>
          </>
        ) : null}
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
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label={`Cost (USD${per})`} value={f.cost} onChangeText={(t) => set({ cost: t })} keyboardType="decimal-pad" inputMode="decimal" placeholder="optional" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Low stock at" value={f.reorder} onChangeText={(t) => set({ reorder: t })} keyboardType="decimal-pad" inputMode="decimal" placeholder="optional" />
          </View>
        </View>
        <Muted>Cost and the low-stock level stay in the back office; tills never see them.</Muted>
        <View style={styles.chips}>
          <Chip label={f.track_stock === false ? 'Made to order (not stock)' : 'Counted as stock'} selected={f.track_stock !== false} onPress={() => set({ track_stock: f.track_stock === false })} />
        </View>
        <OptionsEditor groups={f.groups ?? []} onChange={(groups) => set({ groups })} />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {saved ? <Muted>Saved. Tills pick this up on their next sync.</Muted> : null}
        <Button label="Save product" onPress={() => void save()} busy={busy} />
        {editing.original ? <Button label="Recipe (ingredients used)" tone="secondary" onPress={() => setRecipeFor(editing.original!)} disabled={busy} /> : null}
        <Button
          label="Back to products"
          tone="secondary"
          onPress={() => {
            setEditing(null);
            setSaved(false);
            void products.reload();
          }}
          disabled={busy}
        />
      </Card>
    );
  }

  return (
    <Card>
      <Heading>Products</Heading>
      <Field label="Search" value={search} onChangeText={setSearch} autoCapitalize="none" placeholder="Name or SKU" />
      {active.length > 0 ? (
        <View style={styles.chips}>
          <Chip label="All" selected={filter === null} onPress={() => setFilter(null)} />
          {active.map((c) => (
            <Chip key={c.id} label={c.name} selected={filter === c.id} onPress={() => setFilter(c.id)} />
          ))}
        </View>
      ) : null}
      <Button label="New product" onPress={() => setEditing({ id: null, form: { ...EMPTY, category_id: filter } })} />
      {products.error || error ? <ErrorText>{products.error ?? error}</ErrorText> : null}
      {products.data === null ? <Muted>Loading…</Muted> : products.data.length === 0 ? <Muted>No products.</Muted> : null}
      {products.data?.map((p) => (
        <Pressable
          key={p.product_id}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${p.name}`}
          onPress={() => setEditing({ id: p.product_id, form: toForm(p), original: p })}
          style={[styles.item, { borderColor: colors.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md }}>{p.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
              {[p.sku, p.barcodes.join(', ') || 'no barcode', categoryName(p.category_id)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text style={{ color: p.active ? colors.text : colors.textMuted }}>
            {usd(p.unit_price_minor)}
            {p.unit !== 'each' ? `/${p.unit}` : ''}
            {p.active ? '' : ' · off'}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}
