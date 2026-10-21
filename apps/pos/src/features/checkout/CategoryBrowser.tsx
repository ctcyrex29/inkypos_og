import type { CatalogueProduct, CategoryInfo } from '@inkypos/core';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
      <View style={styles.chips}>
        {list.map((c) => {
          const selected = open?.id === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="tab"
              accessibilityLabel={c.name}
              accessibilityState={{ selected }}
              onPress={() => choose(c.id)}
              style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}
            >
              <Text style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: '600' }}>{c.name}</Text>
            </Pressable>
          );
        })}
      </View>
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
              style={({ pressed }) => [styles.tile, { borderColor: colors.border, backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }} numberOfLines={2}>
                {p.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{price(p)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, minWidth: 140, flexGrow: 1, flexBasis: 140, gap: 4, minHeight: 72 },
});
