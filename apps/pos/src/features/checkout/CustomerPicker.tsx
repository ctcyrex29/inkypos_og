import type { Cart, CustomerInfo } from '@inkypos/core';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Field } from '@/ui/components';
import { spacing, useColors } from '@/ui/theme';

/** Names the customer on the sale, found offline by name or phone digits. */
export function CustomerPicker({
  customer,
  search,
  onChange,
}: {
  customer: Cart['customer'];
  search: (text: string) => Promise<CustomerInfo[]>;
  onChange: (customer: Pick<CustomerInfo, 'id' | 'name'> | null) => void;
}) {
  const colors = useColors();
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ text: string; list: CustomerInfo[] }>({ text: '', list: [] });
  const q = text.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    void search(q).then((list) => !cancelled && setFound({ text: q, list }));
    return () => {
      cancelled = true;
    };
  }, [q, search]);
  const results = q.length >= 2 && found.text === q ? found.list : [];

  if (customer) {
    return (
      <View style={styles.row}>
        <Text style={{ color: colors.text, flex: 1 }}>Customer: {customer.name}</Text>
        <Button label="Remove customer" tone="secondary" onPress={() => onChange(null)} />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <Field label="Customer (optional)" value={text} onChangeText={setText} placeholder="Name or phone" autoCapitalize="words" autoCorrect={false} />
      {results.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${c.name}`}
          onPress={() => {
            onChange({ id: c.id, name: c.name });
            setText('');
          }}
          style={[styles.result, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text, flex: 1 }}>{c.name}</Text>
          <Text style={{ color: colors.textMuted }}>{c.phone ?? ''}</Text>
        </Pressable>
      ))}
      {q.length >= 2 && found.text === q && results.length === 0 ? <Text style={{ color: colors.textMuted }}>No customer found. Managers add customers in the back office.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  result: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: spacing.sm, gap: spacing.md },
});
