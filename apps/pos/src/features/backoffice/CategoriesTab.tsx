import type { CategoryInfo } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { Chip, describeApiError, styles, useLoad, type BackOfficeApi } from './shared';

/** Categories group products on the till's browse screen, in this order. */
export function CategoriesTab({ api }: { api: BackOfficeApi }) {
  const colors = useColors();
  const categories = useLoad(useCallback(() => api.listCategories(), [api]));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = categories.data ?? [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await categories.reload();
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      await api.createCategory({ name: name.trim(), position: list.length });
      setName('');
    });

  /** Swaps a category with its neighbour; positions are rewritten for both. */
  const move = (c: CategoryInfo, by: -1 | 1) => {
    const i = list.findIndex((x) => x.id === c.id);
    const other = list[i + by];
    if (!other) return;
    return run(() => Promise.all([api.updateCategory(c.id, { position: i + by }), api.updateCategory(other.id, { position: i })]));
  };

  return (
    <Card>
      <Heading>Categories</Heading>
      <Muted>Tills show these in order for browsing products.</Muted>
      <Field label="New category" value={name} onChangeText={setName} placeholder="e.g. Drinks" onSubmitEditing={() => name.trim() && void add()} />
      <Button label="Add category" onPress={() => void add()} busy={busy} disabled={!name.trim()} />
      {categories.error || error ? <ErrorText>{categories.error ?? error}</ErrorText> : null}
      {categories.data === null ? <Muted>Loading…</Muted> : list.length === 0 ? <Muted>No categories yet.</Muted> : null}
      {list.map((c, i) => (
        <View key={c.id} style={[styles.item, { borderColor: colors.border }]}>
          <Text style={{ flex: 1, color: c.active ? colors.text : colors.textMuted, fontSize: fontSize.md }}>{c.name}</Text>
          {i > 0 ? <Chip label={`Move ${c.name} up`} selected={false} onPress={() => void move(c, -1)} /> : null}
          <Chip label={c.active ? 'Shown' : 'Hidden'} selected={c.active} onPress={() => void run(() => api.updateCategory(c.id, { active: !c.active }))} />
        </View>
      ))}
    </Card>
  );
}
