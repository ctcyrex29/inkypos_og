import type { BranchInfo, BusinessInfo, PaymentMethodInfo, RegisterInfo } from '../catalogue/contracts';
import { formatMajor, type CurrencyCode } from '../money/money';
import type { ReceiptBlock, ReceiptDocument } from '../platform/ports';
import type { SaleCompletedPayload } from '../sync/events';

export interface ReceiptContext {
  business: BusinessInfo | null;
  branch: BranchInfo | null;
  register: RegisterInfo | null;
  methods: Pick<PaymentMethodInfo, 'code' | 'name'>[];
  /** Local time formatting; injected so tests and devices agree. */
  formatDateTime?: (iso: string) => string;
}

const money = (minor: number, currency: CurrencyCode) => formatMajor({ amount: minor, currency });

function quantity(milli: number, unit?: string): string {
  const whole = milli % 1000 === 0;
  const text = whole ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, '');
  return unit && unit !== 'each' ? `${text} ${unit}` : text;
}

/**
 * Builds the receipt for a completed sale. It is not a fiscal document: the
 * footer says so until a verified fiscalisation provider is in place (Phase 8).
 */
export function buildReceipt(sale: SaleCompletedPayload, ctx: ReceiptContext, widthChars: ReceiptDocument['widthChars'] = 42): ReceiptDocument {
  const c = sale.currency;
  const when = (ctx.formatDateTime ?? ((iso: string) => iso.replace('T', ' ').slice(0, 16)))(sale.completed_at);
  const methodName = (code: string) => ctx.methods.find((m) => m.code === code)?.name ?? code;
  const blocks: ReceiptBlock[] = [];

  blocks.push({ kind: 'text', text: ctx.business?.name ?? 'InkyPOS', align: 'center', bold: true, size: 'large' });
  if (ctx.branch) blocks.push({ kind: 'text', text: ctx.branch.name, align: 'center' });
  blocks.push({ kind: 'columns', left: `Receipt ${sale.receipt_number}`, right: when });
  if (ctx.register) blocks.push({ kind: 'text', text: `Till: ${ctx.register.name}` });
  blocks.push({ kind: 'divider' });

  for (const line of sale.lines) {
    blocks.push({ kind: 'text', text: line.name });
    blocks.push({
      kind: 'columns',
      left: `  ${quantity(line.quantity_milli)} x ${money(line.unit_price_minor, c)}`,
      right: money(line.line_total_minor + line.discount_minor - (line.tax.inclusive ? 0 : line.tax.amount_minor), c),
    });
    if (line.discount_minor > 0) blocks.push({ kind: 'columns', left: '  Discount', right: `-${money(line.discount_minor, c)}` });
    if (!line.tax.inclusive && line.tax.amount_minor > 0) {
      blocks.push({ kind: 'columns', left: `  ${line.tax.code} added`, right: money(line.tax.amount_minor, c) });
    }
  }

  blocks.push({ kind: 'divider' });
  if (sale.totals.discount_minor > 0) {
    blocks.push({ kind: 'columns', left: 'Subtotal', right: money(sale.totals.subtotal_minor, c) });
    blocks.push({ kind: 'columns', left: 'Discounts', right: `-${money(sale.totals.discount_minor, c)}` });
  }
  blocks.push({ kind: 'columns', left: `TOTAL ${c}`, right: money(sale.totals.total_minor, c) });

  const byCode = new Map<string, { rate: number; tax: number }>();
  for (const l of sale.lines) {
    const t = byCode.get(l.tax.code) ?? { rate: l.tax.rate_bp, tax: 0 };
    t.tax += l.tax.amount_minor;
    byCode.set(l.tax.code, t);
  }
  for (const [code, t] of byCode) {
    if (t.tax > 0) blocks.push({ kind: 'columns', left: `${code} ${(t.rate / 100).toFixed(2)}%`, right: money(t.tax, c) });
  }

  blocks.push({ kind: 'divider' });
  for (const p of sale.payments) {
    const pending = p.status === 'pending_confirmation' ? ' (awaiting confirmation)' : p.status === 'failed' || p.status === 'voided' ? ` (${p.status})` : '';
    blocks.push({ kind: 'columns', left: `${methodName(p.method_code)}${pending}`, right: `${p.currency} ${money(p.amount_minor, p.currency)}` });
    if (p.currency !== c) blocks.push({ kind: 'columns', left: `  at ${p.exchange_rate} ${c}/${p.currency}`, right: `= ${money(p.sale_currency_amount_minor, c)}` });
    if (p.reference) blocks.push({ kind: 'text', text: `  Ref ${p.reference}` });
  }
  if (sale.change_minor > 0) blocks.push({ kind: 'columns', left: `CHANGE ${c}`, right: money(sale.change_minor, c) });

  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'text', text: 'Thank you', align: 'center' });
  blocks.push({ kind: 'text', text: 'Not a fiscal tax invoice', align: 'center' });
  blocks.push({ kind: 'feed', lines: 3 });
  blocks.push({ kind: 'cut' });

  return { widthChars, blocks };
}

// ── Renderers ─────────────────────────────────────────────────────────────

/** Word-wraps to `width`, keeping any leading indentation on every line. */
function wrap(text: string, width: number): string[] {
  const indent = /^ */.exec(text)![0].slice(0, Math.max(0, width - 1));
  return wrapWords(text.trim(), width - indent.length).map((line) => indent + line);
}

function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      if (current) lines.push(current);
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      current = '';
    } else if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Fixed-width text, as a thermal printer would print it. Every line fits `widthChars`. */
export function renderReceiptText(doc: ReceiptDocument): string {
  const w = doc.widthChars;
  const out: string[] = [];
  for (const b of doc.blocks) {
    switch (b.kind) {
      case 'text':
        for (const line of wrap(b.text, w)) {
          const pad = b.align === 'center' ? Math.floor((w - line.length) / 2) : b.align === 'right' ? w - line.length : 0;
          out.push(' '.repeat(Math.max(0, pad)) + line);
        }
        break;
      case 'columns': {
        const right = b.right.slice(0, w);
        const room = Math.max(1, w - right.length - 1);
        const left = wrap(b.left, room);
        left.slice(0, -1).forEach((l) => out.push(l));
        const last = left.at(-1)!;
        out.push(last + ' '.repeat(Math.max(1, w - last.length - right.length)) + right);
        break;
      }
      case 'divider':
        out.push('-'.repeat(w));
        break;
      case 'feed':
        for (let i = 0; i < b.lines; i++) out.push('');
        break;
      case 'qr':
      case 'barcode':
        out.push(`[${b.kind}: ${b.data}]`);
        break;
      case 'cut':
        break;
    }
  }
  return out.join('\n');
}

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Printable HTML for the system print dialog (expo-print on phones, the browser on the web). */
export function renderReceiptHtml(doc: ReceiptDocument, title = 'Receipt'): string {
  const rows = doc.blocks
    .map((b) => {
      switch (b.kind) {
        case 'text': {
          const style = [b.align ? `text-align:${b.align}` : '', b.bold ? 'font-weight:700' : '', b.size === 'large' ? 'font-size:1.3em' : ''].filter(Boolean).join(';');
          return `<div style="${style}">${escape(b.text)}</div>`;
        }
        case 'columns':
          return `<div class="row"><span>${escape(b.left)}</span><span>${escape(b.right)}</span></div>`;
        case 'divider':
          return '<hr>';
        case 'feed':
          return '<div style="height:1em"></div>';
        default:
          return '';
      }
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>
@page { size: 80mm auto; margin: 4mm; }
body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
.row { display: flex; justify-content: space-between; gap: 8px; }
.row span:last-child { white-space: nowrap; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
</style></head><body>${rows}</body></html>`;
}
