import {
  addToOrder,
  CheckoutError,
  emptyCart,
  priceCart,
  removeFromOrder,
  unitPrice,
  unsentLines,
  type BusinessInfo,
  type CatalogueProduct,
  type CategoryInfo,
  type ChosenOption,
  type OpenOrder,
} from '@inkypos/core';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CategoryBrowser } from '@/features/checkout/CategoryBrowser';
import { OptionPicker } from '@/features/checkout/OptionPicker';
import { Button, Card, ErrorText, Heading, Muted } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';
import { STATUS_LABEL, where } from './OrdersScreen';

export interface OrderServices {
  business: Pick<BusinessInfo, 'base_currency' | 'rounding'>;
  money: (minor: number) => string;
  newId: () => string;
  search: (text: string) => Promise<CatalogueProduct[]>;
  categories: () => Promise<CategoryInfo[]>;
  inCategory: (categoryId: string) => Promise<CatalogueProduct[]>;
  /** Saves the changed order on this till. */
  save: (order: OpenOrder) => Promise<void>;
  /** Marks new items sent and prints their kitchen ticket. */
  send: (order: OpenOrder) => Promise<OpenOrder>;
  /** Goes to payment for these items (all when omitted), optionally split evenly between people. */
  pay: (order: OpenOrder, lineIds?: string[], splitWays?: number) => void;
}

/** One order: add plates and drinks, send new items to the kitchen, then pay all or some of it. */
export function OrderScreen({ order: initial, services }: { order: OpenOrder; services: OrderServices }) {
  const colors = useColors();
  const [order, setOrder] = useState(initial);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ text: string; products: CatalogueProduct[] }>({ text: '', products: [] });
  const [picking, setPicking] = useState<CatalogueProduct | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { money } = services;

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    void services.search(q).then((products) => !cancelled && setFound({ text: q, products }));
    return () => {
      cancelled = true;
    };
  }, [q, services]);
  const results = q.length >= 2 && found.text === q ? found.products : [];

  const change = async (next: OpenOrder) => {
    setOrder(next);
    setError(null);
    await services.save(next);
  };

  const add = (product: CatalogueProduct, choice: { options?: ChosenOption[]; note?: string } = {}) => {
    try {
      void change(addToOrder(order, product, services.newId, new Date(), choice));
      setQuery('');
    } catch (e) {
      setError(e instanceof CheckoutError ? e.message : (e as Error).message);
    }
  };
  const pick = (product: CatalogueProduct) => (product.option_groups?.length ? setPicking(product) : add(product));

  const remove = (lineId: string) => {
    try {
      void change(removeFromOrder(order, lineId, new Date()));
      setSelected(selected.filter((id) => id !== lineId));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setOrder(await services.send(order));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fresh = unsentLines(order);
  const priced = priceCart({ ...emptyCart(services.business), lines: order.lines });
  const selectedTotal = priceCart({ ...emptyCart(services.business), lines: order.lines.filter((l) => selected.includes(l.line_id)) }).total;

  return (
    <>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Card>
          <Heading>
            Order {order.order_number} · {where(order)}
          </Heading>
          <Muted>{STATUS_LABEL[order.status]}</Muted>
          <TextInput
            accessibilityLabel="Find an item"
            placeholder="Type a dish or drink"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          {results.map((p) => (
            <Pressable key={p.product_id} accessibilityRole="button" accessibilityLabel={`Add ${p.name}`} onPress={() => pick(p)} style={[styles.result, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, flex: 1 }}>{p.name}</Text>
              <Text style={{ color: colors.textMuted }}>{money(p.unit_price_minor)}</Text>
            </Pressable>
          ))}
          <CategoryBrowser categories={services.categories} inCategory={services.inCategory} price={(p) => money(p.unit_price_minor)} onPick={pick} />
        </Card>

        <Card>
          <Heading>Items</Heading>
          {order.lines.length === 0 ? <Muted>Nothing ordered yet.</Muted> : null}
          {order.lines.map((l) => {
            const sent = order.sent_line_ids.includes(l.line_id);
            const isSelected = selected.includes(l.line_id);
            return (
              <View key={l.line_id} style={[styles.line, { borderColor: colors.border }]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Pay for ${l.product.name}`}
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => setSelected(isSelected ? selected.filter((id) => id !== l.line_id) : [...selected, l.line_id])}
                  style={[styles.check, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : 'transparent' }]}
                >
                  <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{isSelected ? '✓' : ''}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: fontSize.md }}>{l.product.name}</Text>
                  {l.options?.length ? <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{l.options.map((o) => o.name).join(', ')}</Text> : null}
                  {l.note ? <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>Note: {l.note}</Text> : null}
                  <Text style={{ color: sent ? colors.textMuted : colors.warning, fontSize: fontSize.sm }}>{sent ? 'In the kitchen' : 'Not sent yet'}</Text>
                </View>
                <Text style={{ color: colors.text }}>{money(unitPrice(l))}</Text>
                {sent ? null : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.product.name}`} onPress={() => remove(l.line_id)} style={[styles.small, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.text }}>×</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '700' }}>Total {money(priced.total)}</Text>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label={fresh.length ? `Send ${fresh.length} to kitchen` : 'Nothing new to send'} onPress={() => void send()} busy={busy} disabled={fresh.length === 0} />
          <Button label={`Pay all ${money(priced.total)}`} onPress={() => services.pay(order)} disabled={busy || order.lines.length === 0} />
          {selected.length > 0 && selected.length < order.lines.length ? (
            <Button label={`Pay selected ${money(selectedTotal)}`} tone="secondary" onPress={() => services.pay(order, selected)} disabled={busy} />
          ) : (
            <Muted>To split the bill by item, tick what one person is paying for.</Muted>
          )}
          {order.lines.length > 0 && selected.length === 0 ? (
            <View style={styles.splitRow}>
              <Muted>Split evenly:</Muted>
              {[2, 3, 4, 5, 6].map((ways) => (
                <Pressable
                  key={ways}
                  accessibilityRole="button"
                  accessibilityLabel={`Split between ${ways}`}
                  disabled={busy}
                  onPress={() => services.pay(order, undefined, ways)}
                  style={[styles.small, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{ways}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Card>
      </ScrollView>
      {picking ? (
        <OptionPicker
          product={picking}
          price={money}
          withNote
          onCancel={() => setPicking(null)}
          onAdd={(choice) => {
            const product = picking;
            setPicking(null);
            add(product, choice);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: fontSize.md },
  result: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: spacing.sm, gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, paddingTop: spacing.sm },
  check: { width: 28, height: 28, borderWidth: 2, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  splitRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  small: { borderWidth: 1, borderRadius: radius.md, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
