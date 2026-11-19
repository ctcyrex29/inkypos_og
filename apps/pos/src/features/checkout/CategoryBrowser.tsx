import type { CatalogueProduct, CategoryInfo } from '@inkypos/core';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';

/**
 * Category chips; choosing one shows its products as large buttons, for items
 * without a barcode (bread, airtime, cooked food). Hidden when the business
 * has no categories.
 */
export function CategoryBrowser({
  categories,
  inCategory,
  price,
  onPick,
}: {
  categories: () => Promise<CategoryInfo[]>;
  inCategory: (categoryId: string) => Promise<CatalogueProduct[]>;
  price: (p: CatalogueProduct) => string;
  onPick: (p: CatalogueProduct) => void;
}) {
  const colors = useColors();
  const [list, setList] = useState<CategoryInfo[]>([]);
  const [open, setOpen] = useState<{ id: string; products: CatalogueProduct[] | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void categories().then((c) => !cancelled && setList(c));
    return () => {
      cancelled = true;
    };
  }, [categories]);

  const choose = (id: string) => {
    if (open?.id === id) return setOpen(null);
    setOpen({ id, products: null });
    void inCategory(id).then((products) => setOpen((o) => (o?.id === id ? { id, products } : o)));
  };

  if (list.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {list.map((c) => (
          <Chip key={c.id} role="tab" label={c.name} selected={open?.id === c.id} onPress={() => choose(c.id)} />
        ))}
      </ScrollView>
      {open ? (
        <View style={styles.grid}>
          {open.products === null ? <Text style={{ color: colors.textMuted }}>Loading…</Text> : null}
          {open.products?.length === 0 ? <Text style={{ color: colors.textMuted }}>Nothing for sale in this category.</Text> : null}
          {open.products?.map((p) => (
            <Pressable
              key={p.product_id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${p.name}`}
              onPress={() => onPick(p)}
              style={({ pressed }) => [styles.tile, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              <View style={[styles.initial, { backgroundColor: colors.primarySoft }]}>
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: fontSize.lg }}>{p.name.trim().charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '700' }} numberOfLines={2}>
                {p.name}
              </Text>
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '700' }}>{price(p)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, minWidth: 100, flexGrow: 1, flexBasis: '30%', maxWidth: '33%', gap: 6, minHeight: 120 },
  initial: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
