import {
  addProduct,
  addTender,
  canComplete,
  CheckoutError,
  emptyCart,
  formatMajor,
  parseAmount,
  parseQuantity,
  priceCart,
  quoteAmountToCover,
  removeLine,
  removeTender,
  setCustomer,
  setQuantity,
  type BusinessInfo,
  type Cart,
  type CatalogueProduct,
  type CategoryInfo,
  type CurrencyCode,
  type CustomerInfo,
  type ExchangeRateInfo,
  type PaymentMethodInfo,
} from '@inkypos/core';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';
import { CategoryBrowser } from './CategoryBrowser';
import { CustomerPicker } from './CustomerPicker';
import { ScannerModal } from './ScannerModal';

export interface CheckoutServices {
  business: BusinessInfo;
  paymentMethods: PaymentMethodInfo[];
  rateFor: (quote: CurrencyCode) => ExchangeRateInfo | null;
  findByBarcode: (code: string) => Promise<CatalogueProduct | null>;
  search: (text: string) => Promise<CatalogueProduct[]>;
  newId: () => string;
  /** Saves the sale locally (it syncs later) and returns its id. */
  complete: (cart: Cart) => Promise<string>;
  cameraAvailable: boolean;
  /** Category browsing (optional: hidden when absent or when there are no categories). */
  categories?: () => Promise<CategoryInfo[]>;
  inCategory?: (categoryId: string) => Promise<CatalogueProduct[]>;
  /** Customer lookup for naming the sale (optional). */
  searchCustomers?: (text: string) => Promise<CustomerInfo[]>;
}

export function CheckoutScreen({ services, onCompleted }: { services: CheckoutServices; onCompleted: (saleId: string) => void }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [cart, setCart] = useState<Cart>(() => emptyCart(services.business));
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ text: string; products: CatalogueProduct[] }>({ text: '', products: [] });
  const [weighing, setWeighing] = useState<{ product: CatalogueProduct; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<ComponentRef<typeof TextInput>>(null);
  const priced = useMemo(() => priceCart(cart), [cart]);
  const money = (minor: number, currency: CurrencyCode = cart.currency) => `${currency} ${formatMajor({ amount: minor, currency })}`;

  // The newest cart, even between renders (two fast scans must both count).
  const cartRef = useRef(cart);
  /**
   * Every cart change goes through here. The new cart is computed in the event
   * handler, never inside a React state updater, so a CheckoutError is caught
   * and shown instead of crashing the screen.
   */
  const update = (change: (c: Cart) => Cart): boolean => {
    try {
      const next = change(cartRef.current);
      cartRef.current = next;
      setCart(next);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof CheckoutError ? e.message : (e as Error).message);
      return false;
    }
  };

  /** `fromSearch`: picked from the name results, so the typed search is finished with. */
  const add = (product: CatalogueProduct, fromSearch = false) => {
    if (fromSearch) {
      setQuery('');
    }
    if (product.unit !== 'each') {
      setWeighing({ product, text: '' });
      return;
    }
    if (!update((c) => addProduct(c, product, services.newId))) return;
    setNotice(`Added ${product.name}`);
    searchRef.current?.focus();
  };

  /**
   * A scanner types the code and presses Enter, and may start the next code
   * immediately. The box is cleared here, synchronously, before the lookup
   * runs, so a lookup finishing later can never wipe the next scan.
   */
  const scanned = () => {
    const code = query.trim();
    setQuery('');
    if (!code) return;
    void services.findByBarcode(code).then((product) => {
      if (product) add(product);
      else setError(`No product with barcode ${code}.`);
    });
  };

  const lookup = async (code: string) => {
    const product = await services.findByBarcode(code.trim());
    if (product) add(product);
    else setError(`No product with barcode ${code.trim()}.`);
  };

  // Name search as the cashier types; scanners finish with Enter (handled by onSubmitEditing).
  // Pure digits are a barcode being typed or scanned; only words trigger a name search.
  const searchText = query.trim();
  const searchable = searchText.length >= 2 && !/^\d+$/.test(searchText);
  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    void services.search(searchText).then((products) => !cancelled && setFound({ text: searchText, products }));
    return () => {
      cancelled = true;
    };
  }, [searchText, searchable, services]);
  // Results only ever belong to the text currently in the box.
  const results = searchable && found.text === searchText ? found.products : [];

  const confirmWeight = () => {
    if (!weighing) return;
    const milli = parseQuantity(weighing.text);
    if (!milli) return setError(`Enter the weight in ${weighing.product.unit}, e.g. 1.25`);
    if (!update((c) => addProduct(c, weighing.product, services.newId, milli))) return;
    setWeighing(null);
    searchRef.current?.focus();
  };

  const complete = async () => {
    setSaving(true);
    try {
      onCompleted(await services.complete(cart));
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const items = (
    <Card>
      <Heading>Items</Heading>
      <TextInput
        ref={searchRef}
        accessibilityLabel="Scan or search"
        placeholder="Scan a barcode or type a name"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={scanned}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        blurOnSubmit={false}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
      />
      {services.cameraAvailable ? <Button label="Scan with camera" tone="secondary" onPress={() => setScanning(true)} /> : null}
      {services.categories && services.inCategory ? (
        <CategoryBrowser
          categories={services.categories}
          inCategory={services.inCategory}
          price={(p) => `${money(p.unit_price_minor)}${p.unit !== 'each' ? ` / ${p.unit}` : ''}`}
          onPick={(p) => add(p)}
        />
      ) : null}
      {results.length > 0 ? (
        <View style={styles.list}>
          {results.map((p) => (
            <Pressable key={p.product_id} accessibilityRole="button" accessibilityLabel={`Add ${p.name}`} onPress={() => add(p, true)} style={[styles.result, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, flex: 1 }}>{p.name}</Text>
              <Text style={{ color: colors.textMuted }}>
                {money(p.unit_price_minor)}
                {p.unit !== 'each' ? ` / ${p.unit}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {weighing ? (
        <View style={styles.list}>
          <Field
            label={`Weight of ${weighing.product.name} (${weighing.product.unit})`}
            value={weighing.text}
            onChangeText={(text) => setWeighing({ ...weighing, text })}
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoFocus
            onSubmitEditing={confirmWeight}
          />
          <Button label="Add" onPress={confirmWeight} />
        </View>
      ) : null}
      {notice && !error ? <Muted>{notice}</Muted> : null}

      {cart.lines.length === 0 ? <Muted>No items yet.</Muted> : null}
      <View style={styles.list}>
        {priced.lines.map(({ line, priced: p }) => (
          <View key={line.line_id} style={[styles.line, { borderColor: colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.md }}>{line.product.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                {line.product.unit === 'each' ? `${line.quantity_milli / 1000}` : `${(line.quantity_milli / 1000).toFixed(3)} ${line.product.unit}`} × {money(line.product.unit_price_minor)}
              </Text>
            </View>
            {line.product.unit === 'each' ? (
              <View style={styles.stepper}>
                <Stepper label={`One less ${line.product.name}`} text="−" onPress={() => update((c) => setQuantity(c, line.line_id, line.quantity_milli - 1000))} />
                <Stepper label={`One more ${line.product.name}`} text="+" onPress={() => update((c) => setQuantity(c, line.line_id, line.quantity_milli + 1000))} />
              </View>
            ) : (
              <Stepper label={`Remove ${line.product.name}`} text="×" onPress={() => update((c) => removeLine(c, line.line_id))} />
            )}
            <Text style={{ color: colors.text, minWidth: 90, textAlign: 'right' }}>{money(p.totalMinor)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );

  const payment = (
    <PaymentPanel
      cart={cart}
      services={services}
      money={money}
      onAdd={(input) => update((c) => addTender(c, input, { newId: services.newId, rateFor: services.rateFor }))}
      onRemove={(id) => update((c) => removeTender(c, id))}
    />
  );

  const status = canComplete(cart);
  const summary = (
    <Card>
      {services.searchCustomers ? (
        <CustomerPicker customer={cart.customer} search={services.searchCustomers} onChange={(c) => update((x) => setCustomer(x, c))} />
      ) : null}
      <Row label="Total" value={money(priced.total)} strong />
      {priced.tax > 0 ? <Row label="Tax included" value={money(priced.tax)} /> : null}
      <Row label="Paid" value={money(priced.tendered)} />
      {priced.change > 0 ? <Row label="Change" value={money(priced.change)} strong /> : <Row label="Still to pay" value={money(priced.remaining)} strong />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Complete sale" onPress={() => void complete()} busy={saving} disabled={!status.ok} />
      <Button label="Clear sale" tone="secondary" onPress={() => update(() => emptyCart(services.business))} disabled={saving || (cart.lines.length === 0 && cart.tenders.length === 0)} />
    </Card>
  );

  return (
    <>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.container, wide && styles.wide]} keyboardShouldPersistTaps="handled">
        {wide ? (
          <>
            <View style={styles.column}>{items}</View>
            <View style={styles.column}>
              {payment}
              {summary}
            </View>
          </>
        ) : (
          <>
            {items}
            {cart.lines.length > 0 ? payment : null}
            {summary}
          </>
        )}
      </ScrollView>
      {scanning ? (
        <ScannerModal
          onClose={() => setScanning(false)}
          onScanned={(code) => {
            setScanning(false);
            void lookup(code);
          }}
        />
      ) : null}
    </>
  );
}

function PaymentPanel({
  cart,
  services,
  money,
  onAdd,
  onRemove,
}: {
  cart: Cart;
  services: CheckoutServices;
  money: (minor: number, currency?: CurrencyCode) => string;
  /** Returns false when the payment was refused (the reason is shown by the screen). */
  onAdd: (input: { method: PaymentMethodInfo; currency: CurrencyCode; amount_minor: number; reference?: string }) => boolean;
  onRemove: (paymentId: string) => void;
}) {
  const colors = useColors();
  const [method, setMethod] = useState<PaymentMethodInfo | null>(services.paymentMethods[0] ?? null);
  const [currency, setCurrency] = useState<CurrencyCode>(cart.currency);
  const [reference, setReference] = useState('');
  const { remaining } = priceCart(cart);
  const rate = currency === cart.currency ? null : services.rateFor(currency);

  // The box shows exactly what is due (converted for another currency) until the
  // cashier types; a typed amount lasts until the method, currency or balance changes.
  const suggested = currency === cart.currency ? remaining : rate ? quoteAmountToCover(remaining, rate.rate) : null;
  const suggestion = suggested && suggested > 0 ? formatMajor({ amount: suggested, currency }) : '';
  const context = `${method?.id}:${currency}:${remaining}`;
  const [typed, setTyped] = useState<{ context: string; text: string } | null>(null);
  const amount = typed?.context === context ? typed.text : suggestion;
  const setAmount = (text: string) => setTyped({ context, text });

  if (!method) return <Banner tone="warning" title="No payment types" body="Sync with the server to download payment types." />;

  const choose = (m: PaymentMethodInfo) => {
    setMethod(m);
    setReference('');
    if (!m.currencies.includes(currency)) setCurrency(m.currencies[0]!);
  };

  const submit = () => {
    const minor = parseAmount(amount);
    if (minor === null) return onAdd({ method, currency, amount_minor: -1 });
    if (onAdd({ method, currency, amount_minor: minor, ...(reference ? { reference } : {}) })) setReference('');
  };

  return (
    <Card>
      <Heading>Payment</Heading>
      <View style={styles.chips}>
        {services.paymentMethods.map((m) => (
          <Chip key={m.id} label={m.name} selected={m.id === method.id} onPress={() => choose(m)} />
        ))}
      </View>
      {method.currencies.length > 1 ? (
        <View style={styles.chips}>
          {method.currencies.map((c) => (
            <Chip key={c} label={c} selected={c === currency} onPress={() => setCurrency(c)} />
          ))}
        </View>
      ) : null}
      {rate ? <Muted>Rate: 1 {currency} = {rate.rate} {cart.currency}</Muted> : null}
      {currency !== cart.currency && !rate ? <ErrorText>No {currency} rate is set. A manager must set one.</ErrorText> : null}
      <Field label={`Amount (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" inputMode="decimal" onSubmitEditing={submit} />
      {method.requires_reference ? <Field label={`${method.name} reference`} value={reference} onChangeText={setReference} autoCapitalize="characters" /> : null}
      {method.initial_status === 'pending_confirmation' ? <Muted>{method.name} is recorded as awaiting confirmation.</Muted> : null}
      <Button label={`Add ${method.name} payment`} onPress={submit} disabled={remaining === 0 && !method.gives_change} />
      {cart.tenders.map((t) => (
        <View key={t.payment_id} style={[styles.line, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text, flex: 1 }}>
            {t.method.name}
            {t.reference ? ` · ${t.reference}` : ''}
            {t.status === 'pending_confirmation' ? ' · awaiting confirmation' : ''}
          </Text>
          <Text style={{ color: colors.text }}>
            {money(t.amount_minor, t.currency)}
            {t.currency !== cart.currency ? ` = ${money(t.sale_currency_amount_minor)}` : ''}
          </Text>
          <Stepper label={`Remove ${t.method.name} payment`} text="×" onPress={() => onRemove(t.payment_id)} />
        </View>
      ))}
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

function Stepper({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={[styles.step, { borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: fontSize.lg }}>{text}</Text>
    </Pressable>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const colors = useColors();
  const style = { color: colors.text, fontSize: strong ? fontSize.lg : fontSize.md, fontWeight: strong ? ('700' as const) : ('400' as const) };
  return (
    <View style={styles.row}>
      <Text style={style}>{label}</Text>
      <Text style={style}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  wide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1, gap: spacing.lg },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: fontSize.lg },
  list: { gap: spacing.sm },
  result: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, paddingTop: spacing.sm },
  stepper: { flexDirection: 'row', gap: spacing.xs },
  step: { width: 40, height: 40, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
