import {
  addProduct,
  addTender,
  canComplete,
  CheckoutError,
  emptyCart,
  formatMajor,
  nextSplitShare,
  parseAmount,
  parseQuantity,
  priceCart,
  quoteAmountToCover,
  removeLine,
  removeTender,
  setCustomer,
  setQuantity,
  unitPrice,
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
import { Banner, Button, Card, Chip, ErrorText, Field, Heading, Icon, IconButton, Muted, type IconName } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';
import { CategoryBrowser } from './CategoryBrowser';
import { CustomerPicker } from './CustomerPicker';
import { OptionPicker } from './OptionPicker';
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

export function CheckoutScreen({
  services,
  onCompleted,
  initialCart,
  itemsLocked = false,
  splitWays,
}: {
  services: CheckoutServices;
  onCompleted: (saleId: string) => void;
  /** Start from these items (paying a restaurant order). */
  initialCart?: Cart;
  /** The items are fixed: only payment and the customer can change. */
  itemsLocked?: boolean;
  /** Split the bill evenly between this many people, each paying in turn on this one sale. */
  splitWays?: number;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [cart, setCart] = useState<Cart>(() => initialCart ?? emptyCart(services.business));
  const [picking, setPicking] = useState<CatalogueProduct | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ text: string; products: CatalogueProduct[] }>({ text: '', products: [] });
  const [weighing, setWeighing] = useState<{ product: CatalogueProduct; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'items' | 'pay'>('items');
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
    if (product.option_groups?.length) {
      setPicking(product);
      return;
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

  const itemCount = cart.lines.reduce((n, l) => n + (l.product.unit === 'each' ? l.quantity_milli / 1000 : 1), 0);

  const finder = itemsLocked ? null : (
    <View style={styles.finder}>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Icon name="search" size={20} color={colors.textMuted} />
          <TextInput
            ref={searchRef}
            accessibilityLabel="Scan or search"
            placeholder="Scan a barcode or type a name"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={scanned}
            autoFocus={wide}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            submitBehavior="submit"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query ? <IconButton icon="close" label="Clear search" onPress={() => setQuery('')} tone="ghost" size={32} /> : null}
        </View>
        {services.cameraAvailable ? <IconButton icon="barcode-outline" label="Scan with camera" onPress={() => setScanning(true)} tone="primary" size={52} /> : null}
      </View>
      {results.length > 0 ? (
        <Card style={styles.results}>
          {results.map((p) => (
            <Pressable
              key={p.product_id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${p.name}`}
              onPress={() => add(p, true)}
              style={({ pressed }) => [styles.result, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="add-circle" size={22} color={colors.primary} />
              <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>{p.name}</Text>
              <Text style={{ color: colors.textMuted }}>
                {money(p.unit_price_minor)}
                {p.unit !== 'each' ? ` / ${p.unit}` : ''}
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : searchable && found.text === searchText ? (
        <Muted>{`Nothing matches “${searchText}”.`}</Muted>
      ) : null}
      {weighing ? (
        <Card>
          <Field
            label={`Weight of ${weighing.product.name} (${weighing.product.unit})`}
            value={weighing.text}
            onChangeText={(text) => setWeighing({ ...weighing, text })}
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoFocus
            onSubmitEditing={confirmWeight}
          />
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" tone="secondary" onPress={() => setWeighing(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Add" onPress={confirmWeight} />
            </View>
          </View>
        </Card>
      ) : null}
      {services.categories && services.inCategory ? (
        <CategoryBrowser
          categories={services.categories}
          inCategory={services.inCategory}
          price={(p) => `${money(p.unit_price_minor)}${p.unit !== 'each' ? ` / ${p.unit}` : ''}`}
          onPick={(p) => add(p)}
        />
      ) : null}
    </View>
  );

  const items = (
    <Card>
      <View style={styles.cardHead}>
        <Heading>Current sale</Heading>
        {cart.lines.length > 0 ? <Text style={{ color: colors.textMuted, fontWeight: '600' }}>{`${itemCount} item${itemCount === 1 ? '' : 's'}`}</Text> : null}
      </View>
      {notice && !error ? (
        <View style={styles.notice}>
          <Icon name="checkmark-circle" size={16} color={colors.success} />
          <Text style={{ color: colors.success, fontWeight: '600', fontSize: fontSize.sm }}>{notice}</Text>
        </View>
      ) : null}
      {/* On a phone's item step the payment card (which shows errors) is hidden: show them here. */}
      {error && !wide && !itemsLocked && step === 'items' ? <ErrorText>{error}</ErrorText> : null}
      {cart.lines.length === 0 ? (
        <View style={styles.emptyCart}>
          <Icon name="cart-outline" size={34} color={colors.textMuted} />
          <Muted>No items yet. Scan, search or pick from a category.</Muted>
        </View>
      ) : null}
      {priced.lines.map(({ line, priced: p }) => (
        <View key={line.line_id} style={[styles.line, { borderColor: colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>{line.product.name}</Text>
            {line.options?.length ? <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{line.options.map((o) => o.name).join(', ')}</Text> : null}
            {line.note ? <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>Note: {line.note}</Text> : null}
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
              {line.product.unit === 'each' ? `${line.quantity_milli / 1000}` : `${(line.quantity_milli / 1000).toFixed(3)} ${line.product.unit}`} × {money(unitPrice(line))}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.md }}>{money(p.totalMinor)}</Text>
            {itemsLocked ? null : line.product.unit === 'each' ? (
              <View style={styles.stepper}>
                <Stepper label={`One less ${line.product.name}`} icon={line.quantity_milli <= 1000 ? 'trash-outline' : 'remove'} onPress={() => update((c) => setQuantity(c, line.line_id, line.quantity_milli - 1000))} />
                <Text style={{ color: colors.text, minWidth: 24, textAlign: 'center', fontWeight: '700' }}>{line.quantity_milli / 1000}</Text>
                <Stepper label={`One more ${line.product.name}`} icon="add" onPress={() => update((c) => setQuantity(c, line.line_id, line.quantity_milli + 1000))} />
              </View>
            ) : (
              <Stepper label={`Remove ${line.product.name}`} icon="trash-outline" onPress={() => update((c) => removeLine(c, line.line_id))} />
            )}
          </View>
        </View>
      ))}
      {!itemsLocked && (cart.lines.length > 0 || cart.tenders.length > 0) ? (
        <Button label="Clear sale" icon="trash-outline" tone="ghost" onPress={() => update(() => emptyCart(services.business))} disabled={saving} />
      ) : null}
    </Card>
  );

  const payment = (
    <PaymentPanel
      cart={cart}
      services={services}
      money={money}
      splitWays={splitWays}
      onAdd={(input) => update((c) => addTender(c, input, { newId: services.newId, rateFor: services.rateFor }))}
      onRemove={(id) => update((c) => removeTender(c, id))}
    />
  );

  const status = canComplete(cart);
  const totalBox = (
    <View style={[styles.totalBox, { backgroundColor: colors.primarySoft }]}>
      <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Total</Text>
      <Text style={[styles.total, { color: colors.text }]}>{money(priced.total)}</Text>
      {priced.tax > 0 ? <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{`Tax included ${money(priced.tax)}`}</Text> : null}
    </View>
  );
  // Phones show the total at the top of the payment step; here it sits with the button.
  const summary = (
    <Card>
      {wide ? totalBox : null}
      {services.searchCustomers ? (
        <CustomerPicker customer={cart.customer} search={services.searchCustomers} onChange={(c) => update((x) => setCustomer(x, c))} />
      ) : null}
      <Row label="Paid" value={money(priced.tendered)} />
      {priced.change > 0 ? <Row label="Change" value={money(priced.change)} strong tone={colors.success} /> : <Row label="Still to pay" value={money(priced.remaining)} strong />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Complete sale" icon="checkmark-circle" size="lg" onPress={() => void complete()} busy={saving} disabled={!status.ok} />
    </Card>
  );

  // Phones: build the sale, then Charge opens the payment step. Tablets: both side by side.
  const paying = wide || itemsLocked || step === 'pay';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.container, wide && styles.wide]} keyboardShouldPersistTaps="handled">
        {wide ? (
          <>
            <View style={styles.column}>
              {finder}
              {items}
            </View>
            <View style={styles.column}>
              {payment}
              {summary}
            </View>
          </>
        ) : paying ? (
          <>
            {itemsLocked ? items : (
              <Pressable accessibilityRole="button" accessibilityLabel="Back to items" onPress={() => setStep('items')} hitSlop={8} style={styles.back}>
                <Icon name="arrow-back" size={20} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '700' }}>{`Back to items (${itemCount})`}</Text>
              </Pressable>
            )}
            {totalBox}
            {payment}
            {summary}
          </>
        ) : (
          <>
            {finder}
            {items}
          </>
        )}
      </ScrollView>
      {!wide && !paying ? (
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Button
            label="Charge"
            detail={money(priced.total)}
            icon="card"
            tone="accent"
            size="lg"
            disabled={cart.lines.length === 0}
            onPress={() => {
              setError(null);
              setStep('pay');
            }}
          />
        </View>
      ) : null}
      {picking ? (
        <OptionPicker
          product={picking}
          price={(minor) => money(minor)}
          onCancel={() => setPicking(null)}
          onAdd={(choice) => {
            const product = picking;
            setPicking(null);
            if (update((c) => addProduct(c, product, services.newId, 1000, choice))) setNotice(`Added ${product.name}`);
          }}
        />
      ) : null}
      {scanning ? (
        <ScannerModal
          onClose={() => setScanning(false)}
          onScanned={(code) => {
            setScanning(false);
            void lookup(code);
          }}
        />
      ) : null}
    </View>
  );
}

function PaymentPanel({
  cart,
  services,
  money,
  splitWays,
  onAdd,
  onRemove,
}: {
  cart: Cart;
  services: CheckoutServices;
  money: (minor: number, currency?: CurrencyCode) => string;
  splitWays?: number;
  /** Returns false when the payment was refused (the reason is shown by the screen). */
  onAdd: (input: { method: PaymentMethodInfo; currency: CurrencyCode; amount_minor: number; reference?: string }) => boolean;
  onRemove: (paymentId: string) => void;
}) {
  const colors = useColors();
  const [method, setMethod] = useState<PaymentMethodInfo | null>(services.paymentMethods[0] ?? null);
  const [currency, setCurrency] = useState<CurrencyCode>(cart.currency);
  const [reference, setReference] = useState('');
  const { remaining, total } = priceCart(cart);
  const rate = currency === cart.currency ? null : services.rateFor(currency);
  const share = splitWays && splitWays > 1 ? nextSplitShare(total, splitWays, cart.tenders.length, remaining) : null;
  const due = share ? share.amountMinor : remaining;

  // The box shows exactly what is due (this person's share when splitting, converted
  // for another currency) until the cashier types; a typed amount lasts until the
  // method, currency or balance changes.
  const suggested = currency === cart.currency ? due : rate ? quoteAmountToCover(due, rate.rate) : null;
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

  // Cash: round notes above what is due, so the cashier taps instead of typing.
  const quick =
    method.gives_change && suggested && suggested > 0
      ? [...new Set([1, 2, 5, 10, 20, 50, 100].map((note) => Math.ceil(suggested / (note * 100)) * note * 100))].filter((v) => v > suggested).slice(0, 3)
      : [];

  return (
    <Card>
      <Heading>Payment</Heading>
      {share ? <Muted>{`Split ${share.ways} ways · person ${share.person} pays ${money(share.amountMinor)}`}</Muted> : null}
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
      {quick.length > 0 ? (
        <View style={styles.chips}>
          {quick.map((v) => {
            const text = formatMajor({ amount: v, currency });
            return (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityLabel={`Amount ${text}`}
                onPress={() => setAmount(text)}
                style={({ pressed }) => [styles.quick, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{text}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {method.requires_reference ? <Field label={`${method.name} reference`} value={reference} onChangeText={setReference} autoCapitalize="characters" /> : null}
      {method.initial_status === 'pending_confirmation' ? <Muted>{method.name} is recorded as awaiting confirmation.</Muted> : null}
      <Button label={`Add ${method.name} payment`} icon="add-circle-outline" tone="secondary" onPress={submit} disabled={remaining === 0 && !method.gives_change} />
      {cart.tenders.map((t) => (
        <View key={t.payment_id} style={[styles.line, { borderColor: colors.border }]}>
          <Icon name="wallet-outline" size={20} color={colors.primary} />
          <Text style={{ color: colors.text, flex: 1 }}>
            {t.method.name}
            {t.reference ? ` · ${t.reference}` : ''}
            {t.status === 'pending_confirmation' ? ' · awaiting confirmation' : ''}
          </Text>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {money(t.amount_minor, t.currency)}
            {t.currency !== cart.currency ? ` = ${money(t.sale_currency_amount_minor)}` : ''}
          </Text>
          <Stepper label={`Remove ${t.method.name} payment`} icon="close" onPress={() => onRemove(t.payment_id)} />
        </View>
      ))}
    </Card>
  );
}

function Stepper({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.step, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}

function Row({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  const colors = useColors();
  const style = { color: tone ?? colors.text, fontSize: strong ? fontSize.lg : fontSize.md, fontWeight: strong ? ('700' as const) : ('400' as const) };
  return (
    <View style={styles.row}>
      <Text style={style}>{label}</Text>
      <Text style={style}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, width: '100%', maxWidth: 1200, alignSelf: 'center', paddingBottom: spacing.xxxl },
  wide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1, gap: spacing.lg },
  finder: { gap: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing.md, minHeight: 52 },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: spacing.md },
  results: { padding: spacing.sm, gap: 0 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  pair: { flexDirection: 'row', gap: spacing.md },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyCart: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  step: { width: 36, height: 36, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 42, justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  totalBox: { borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', gap: 2 },
  total: { fontSize: fontSize.huge, fontWeight: '800', letterSpacing: -0.5 },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', paddingVertical: spacing.xs },
  bottomBar: { padding: spacing.md, paddingBottom: spacing.lg, borderTopWidth: 1 },
});
