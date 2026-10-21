import { CheckoutError, chooseOptions, unitPrice, type CatalogueProduct, type ChosenOption } from '@inkypos/core';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { radius, spacing, useColors } from '@/ui/theme';

/**
 * Choices for an item before it is added: one per single-choice group, any
 * number in a multiple-choice group, and a note for the kitchen.
 */
export function OptionPicker({
  product,
  price,
  withNote = false,
  onAdd,
  onCancel,
}: {
  product: CatalogueProduct;
  price: (minor: number) => string;
  /** Offer a kitchen note (restaurant orders). */
  withNote?: boolean;
  onAdd: (choice: { options: ChosenOption[]; note?: string }) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const groups = product.option_groups ?? [];
  // Free single choices start on their first option so the common plate is one tap.
  const [picked, setPicked] = useState<string[]>(() =>
    groups.filter((g) => g.required && !g.multiple && g.options[0]!.price_delta_minor === 0).map((g) => g.options[0]!.id),
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (groupId: string, optionId: string) => {
    const group = groups.find((g) => g.id === groupId)!;
    setError(null);
    if (group.multiple) setPicked(picked.includes(optionId) ? picked.filter((id) => id !== optionId) : [...picked, optionId]);
    else setPicked([...picked.filter((id) => !group.options.some((o) => o.id === id)), optionId]);
  };

  const chosen = (() => {
    try {
      return chooseOptions(product, picked);
    } catch {
      return null;
    }
  })();
  const each = unitPrice({ product, options: chosen ?? [] });

  const add = () => {
    try {
      onAdd({ options: chooseOptions(product, picked), ...(note.trim() ? { note: note.trim() } : {}) });
    } catch (e) {
      setError(e instanceof CheckoutError ? e.message : (e as Error).message);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Card>
            <Heading>{product.name}</Heading>
            {groups.map((g) => (
              <View key={g.id} style={{ gap: spacing.xs }}>
                <Muted>
                  {g.name}
                  {g.required ? (g.multiple ? ' (choose at least one)' : ' (choose one)') : g.multiple ? ' (optional, any)' : ' (optional)'}
                </Muted>
                <View style={styles.chips}>
                  {g.options.map((o) => {
                    const selected = picked.includes(o.id);
                    return (
                      <Pressable
                        key={o.id}
                        accessibilityRole={g.multiple ? 'checkbox' : 'radio'}
                        accessibilityLabel={o.name}
                        accessibilityState={g.multiple ? { checked: selected } : { selected }}
                        onPress={() => toggle(g.id, o.id)}
                        style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}
                      >
                        <Text style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: '600' }}>
                          {o.name}
                          {o.price_delta_minor > 0 ? ` +${price(o.price_delta_minor)}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            {withNote ? <Field label="Note for the kitchen" value={note} onChangeText={setNote} placeholder="e.g. sadza rakaoma" maxLength={200} /> : null}
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button label={`Add for ${price(each)}`} onPress={add} />
            <Button label="Cancel" tone="secondary" onPress={onCancel} />
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { padding: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center', justifyContent: 'center', flexGrow: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
