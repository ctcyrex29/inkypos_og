import { parseQuantity, type BackOfficeProduct, type RecipeItemInput } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { Chip, describeApiError, qty, styles, useLoad, type BackOfficeApi } from './shared';

type Item = RecipeItemInput & { name: string; unit: string };

/**
 * What one portion uses up. Lines for "every portion" always apply; lines tied
 * to an option apply only when that option is chosen (beef for beef stew).
 * Ingredients come off stock when the sale reaches the server.
 */
export function RecipeEditor({ api, product, onDone }: { api: BackOfficeApi; product: BackOfficeProduct; onDone: () => void }) {
  const colors = useColors();
  const recipe = useLoad(useCallback(() => api.getRecipe(product.product_id), [api, product.product_id]));
  const [items, setItems] = useState<Item[] | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<BackOfficeProduct[]>([]);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const options = (product.option_groups ?? []).flatMap((g) => g.options.map((o) => ({ id: o.id, label: `${g.name}: ${o.name}` })));
  const list: Item[] = items ?? (recipe.data?.items ?? []).map((i) => ({ option_id: i.option_id, ingredient_id: i.ingredient_id, quantity_milli: i.quantity_milli, name: i.ingredient_name, unit: i.unit }));
  const appliesTo = (id: string | null) => (id ? (options.find((o) => o.id === id)?.label ?? 'a removed option') : 'Every portion');

  const find = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) return setFound([]);
    try {
      setFound((await api.listProducts(text.trim())).filter((p) => p.product_id !== product.product_id).slice(0, 6));
    } catch (e) {
      setError(describeApiError(e));
    }
  };

  const add = (ingredient: BackOfficeProduct) => {
    const milli = parseQuantity(amount);
    if (!milli) return setError(`Enter how much one portion uses, in ${ingredient.unit === 'each' ? 'items' : ingredient.unit}, e.g. 0.25`);
    setItems([...list, { option_id: optionId, ingredient_id: ingredient.product_id, quantity_milli: milli, name: ingredient.name, unit: ingredient.unit }]);
    setSearch('');
    setFound([]);
    setAmount('');
    setError(null);
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setRecipe(product.product_id, list.map(({ option_id, ingredient_id, quantity_milli }) => ({ option_id, ingredient_id, quantity_milli })));
      setSaved(true);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Heading>Recipe for {product.name}</Heading>
      <Muted>What one portion uses. Ingredients come off stock when the sale reaches the server.</Muted>
      {recipe.error ? <ErrorText>{recipe.error}</ErrorText> : null}
      {list.length === 0 ? <Muted>No ingredients yet.</Muted> : null}
      {list.map((item, i) => (
        <View key={`${item.ingredient_id}${item.option_id ?? ''}${i}`} style={[styles.item, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md }}>
              {qty(item.quantity_milli, item.unit)} {item.name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{appliesTo(item.option_id)}</Text>
          </View>
          <Chip label={`Remove ${item.name}`} selected={false} onPress={() => setItems(list.filter((_, j) => j !== i))} />
        </View>
      ))}
      <Heading>Add an ingredient</Heading>
      {options.length > 0 ? (
        <View style={styles.chips}>
          <Chip label="Every portion" selected={optionId === null} onPress={() => setOptionId(null)} />
          {options.map((o) => (
            <Chip key={o.id} label={o.label} selected={optionId === o.id} onPress={() => setOptionId(o.id)} />
          ))}
        </View>
      ) : null}
      <Field label="Amount per portion" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" inputMode="decimal" placeholder="e.g. 0.25" />
      <Field label="Ingredient" value={search} onChangeText={(t) => void find(t)} autoCapitalize="none" placeholder="Search products, e.g. Beef" />
      {found.map((p) => (
        <Pressable key={p.product_id} accessibilityRole="button" accessibilityLabel={`Use ${p.name}`} onPress={() => add(p)} style={[styles.item, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text }}>
            {p.name} ({p.unit === 'each' ? 'items' : p.unit})
          </Text>
        </Pressable>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? <Muted>Recipe saved.</Muted> : null}
      <Button label="Save recipe" onPress={() => void save()} busy={busy} disabled={items === null} />
      <Button label="Back to product" tone="secondary" onPress={onDone} disabled={busy} />
    </Card>
  );
}
