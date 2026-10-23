import type { OptionGroupInput } from '../api/backoffice';
import { formatMajor } from '../money/money';
import { parseAmount } from '../sales/checkout';
import type { OptionGroup } from './contracts';

/**
 * Product option groups as a manager edits them (the till and web back offices):
 * choices typed one per line, "Rice +0.50" for a choice that costs more.
 */
export interface GroupDraft {
  id?: string;
  name: string;
  required: boolean;
  multiple: boolean;
  text: string;
}

export function toDrafts(groups: OptionGroup[] | undefined): GroupDraft[] {
  return (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    multiple: g.multiple,
    text: g.options.map((o) => (o.price_delta_minor > 0 ? `${o.name} +${formatMajor({ amount: o.price_delta_minor, currency: 'USD' })}` : o.name)).join('\n'),
  }));
}

/**
 * Drafts back to groups for saving, or a message saying what to fix. A choice
 * keeps its id when its name is unchanged, so sales and recipes that refer to
 * it stay linked.
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
