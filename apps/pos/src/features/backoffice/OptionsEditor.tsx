import { formatMajor, parseAmount, type OptionGroup, type OptionGroupInput } from '@inkypos/core';
import { Text, View } from 'react-native';
import { Button, Field, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { Chip, styles } from './shared';

/** A group as edited: its choices are typed one per line, "Rice +0.50" for a choice that costs more. */
export interface GroupDraft {
  id?: string;
  name: string;
  required: boolean;
  multiple: boolean;
  text: string;
}

export function toDrafts(groups: OptionGroup[] | undefined): GroupDraft[] {
  return (groups ?? []).map((g) => ({
    id: g.id, name: g.name, required: g.required, multiple: g.multiple,
    text: g.options.map((o) => (o.price_delta_minor > 0 ? `${o.name} +${formatMajor({ amount: o.price_delta_minor, currency: 'USD' })}` : o.name)).join('\n'),
  }));
}

/**
 * Drafts back to groups for saving. A choice keeps its id when its name is
 * unchanged, so sales and recipes that refer to it stay linked.
 */
export function fromDrafts(drafts: GroupDraft[], original: OptionGroup[] | undefined): OptionGroupInput[] | string {
  const out: OptionGroupInput[] = [];
  for (const d of drafts) {
    if (!d.name.trim()) return 'Give every option group a name, e.g. Relish.';
    const before = original?.find((g) => g.id === d.id);
    const options: OptionGroupInput['options'] = [];
    for (const raw of d.text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^(.*?)(?:\s*\+\s*(\d+(?:[.,]\d{1,2})?))?$/.exec(raw)!;
      const name = m[1]!.trim();
      const price = m[2] ? parseAmount(m[2]) : 0;
      if (!name || price === null) return `Write each ${d.name} choice as a name, with "+0.50" for one that costs more.`;
      const id = before?.options.find((o) => o.name.toLowerCase() === name.toLowerCase())?.id;
      options.push({ ...(id ? { id } : {}), name, price_delta_minor: price });
    }
    if (options.length === 0) return `Add at least one choice to ${d.name}.`;
    out.push({ ...(d.id ? { id: d.id } : {}), name: d.name.trim(), required: d.required, multiple: d.multiple, options });
  }
  return out;
}

export function OptionsEditor({ groups, onChange }: { groups: GroupDraft[]; onChange: (groups: GroupDraft[]) => void }) {
  const colors = useColors();
  const set = (i: number, patch: Partial<GroupDraft>) => onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>Options</Text>
      <Muted>Choices made when ordering, such as the relish with sadza. One choice per line; add “+0.50” to a choice that costs more.</Muted>
      {groups.map((g, i) => (
        <View key={g.id ?? `new-${i}`} style={{ gap: 6, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8 }}>
          <Field label={`Option group ${i + 1}`} value={g.name} onChangeText={(t) => set(i, { name: t })} placeholder="e.g. Relish" />
          <View style={styles.chips}>
            <Chip label={g.required ? 'Must choose' : 'Optional'} selected={g.required} onPress={() => set(i, { required: !g.required })} />
            <Chip label={g.multiple ? 'Several allowed' : 'Only one'} selected={g.multiple} onPress={() => set(i, { multiple: !g.multiple })} />
            <Chip label={`Remove group ${i + 1}`} selected={false} onPress={() => onChange(groups.filter((_, j) => j !== i))} />
          </View>
          <Field label={`Choices for group ${i + 1}`} value={g.text} onChangeText={(t) => set(i, { text: t })} multiline placeholder={'Beef stew +2.00\nRoad-runner chicken +2.50'} />
        </View>
      ))}
      <Button label="Add option group" tone="secondary" onPress={() => onChange([...groups, { name: '', required: true, multiple: false, text: '' }])} />
    </View>
  );
}
