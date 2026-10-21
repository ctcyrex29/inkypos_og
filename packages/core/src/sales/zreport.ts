import { formatMajor, type CurrencyCode } from '../money/money';
import type { ReceiptBlock, ReceiptDocument } from '../platform/ports';
import type { ShiftRecord } from '../storage/ports';
import type { CashMovementPayload, RefundIssuedPayload, SaleCompletedPayload } from '../sync/events';
import type { ReceiptContext } from './receipt';
import { cashVariance, type CurrencyAmount } from './shift';

const money = (r: CurrencyAmount) => `${r.currency} ${formatMajor({ amount: r.amount_minor, currency: r.currency })}`;
/** "+USD 0.50" / "-USD 0.50": the sign before the currency, as on the other lines. */
const signed = (r: CurrencyAmount) => `${r.amount_minor > 0 ? '+' : r.amount_minor < 0 ? '-' : ''}${money({ ...r, amount_minor: Math.abs(r.amount_minor) })}`;

export interface ShiftActivity {
  sales: SaleCompletedPayload[];
  refunds: RefundIssuedPayload[];
  movements: CashMovementPayload[];
}

/** Takings per payment type and currency: tendered, pending confirmation, refunded. */
export function paymentTotals(activity: Pick<ShiftActivity, 'sales' | 'refunds'>) {
  const rows = new Map<string, { method_code: string; currency: CurrencyCode; tendered: number; pending: number; refunded: number }>();
  const row = (method_code: string, currency: CurrencyCode) => {
    const k = `${method_code}|${currency}`;
    if (!rows.has(k)) rows.set(k, { method_code, currency, tendered: 0, pending: 0, refunded: 0 });
    return rows.get(k)!;
  };
  for (const s of activity.sales) {
    for (const p of s.payments) {
      const r = row(p.method_code, p.currency);
      r.tendered += p.amount_minor;
      if (p.status === 'pending_confirmation') r.pending += p.amount_minor;
    }
  }
  for (const f of activity.refunds) for (const p of f.payments) row(p.method_code, p.currency).refunded += p.amount_minor;
  return [...rows.values()].sort((a, b) => `${a.method_code}${a.currency}`.localeCompare(`${b.method_code}${b.currency}`));
}

/**
 * End-of-shift (Z) report from the till's own records, so it prints offline.
 * Sales totals are in the sale currency; takings and cash per currency.
 */
export function buildShiftReport(
  shift: ShiftRecord,
  activity: ShiftActivity,
  ctx: ReceiptContext & { cashierName?: string | null },
  widthChars: ReceiptDocument['widthChars'] = 42,
): ReceiptDocument {
  const when = ctx.formatDateTime ?? ((iso: string) => iso.replace('T', ' ').slice(0, 16));
  const methodName = (code: string) => ctx.methods.find((m) => m.code === code)?.name ?? code;
  const currency = (activity.sales[0]?.currency ?? ctx.business?.base_currency ?? 'USD') as CurrencyCode;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const blocks: ReceiptBlock[] = [
    { kind: 'text', text: ctx.business?.name ?? 'InkyPOS', align: 'center', bold: true, size: 'large' },
    { kind: 'text', text: shift.closed ? 'SHIFT REPORT (Z)' : 'SHIFT SO FAR (X)', align: 'center', bold: true },
  ];
  if (ctx.register) blocks.push({ kind: 'text', text: `Till: ${ctx.register.name}` });
  if (ctx.cashierName) blocks.push({ kind: 'text', text: `Cashier: ${ctx.cashierName}` });
  blocks.push({ kind: 'columns', left: 'Opened', right: when(shift.opened_at) });
  if (shift.closed) blocks.push({ kind: 'columns', left: 'Closed', right: when(shift.closed.closed_at) });
  blocks.push({ kind: 'divider' });

  const voids = activity.refunds.filter((r) => r.reason === 'void');
  blocks.push({ kind: 'columns', left: `Sales (${activity.sales.length})`, right: money({ currency, amount_minor: sum(activity.sales.map((s) => s.totals.total_minor)) }) });
  blocks.push({ kind: 'columns', left: 'Tax included', right: money({ currency, amount_minor: sum(activity.sales.map((s) => s.totals.tax_minor)) }) });
  const discount = sum(activity.sales.map((s) => s.totals.discount_minor));
  if (discount > 0) blocks.push({ kind: 'columns', left: 'Discounts', right: money({ currency, amount_minor: discount }) });
  blocks.push({
    kind: 'columns',
    left: `Refunds ${activity.refunds.length - voids.length}, voids ${voids.length}`,
    right: `-${money({ currency, amount_minor: sum(activity.refunds.map((r) => r.totals.total_minor)) })}`,
  });
  blocks.push({ kind: 'divider' });

  blocks.push({ kind: 'text', text: 'Takings by payment type', bold: true });
  for (const p of paymentTotals(activity)) {
    blocks.push({ kind: 'columns', left: methodName(p.method_code), right: money({ currency: p.currency, amount_minor: p.tendered - p.refunded }) });
    if (p.pending > 0) blocks.push({ kind: 'columns', left: '  not yet confirmed', right: money({ currency: p.currency, amount_minor: p.pending }) });
  }
  const change = sum(activity.sales.map((s) => s.change_minor));
  if (change > 0) blocks.push({ kind: 'columns', left: 'Change given', right: `-${money({ currency, amount_minor: change })}` });
  blocks.push({ kind: 'divider' });

  blocks.push({ kind: 'text', text: 'Cash drawer', bold: true });
  for (const f of shift.opening_float) blocks.push({ kind: 'columns', left: 'Opening float', right: money(f) });
  for (const m of activity.movements) {
    blocks.push({
      kind: 'columns',
      left: `${m.direction === 'in' ? 'In' : 'Out'}: ${m.reason.replace('_', ' ')}${m.note ? ` (${m.note})` : ''}`,
      right: `${m.direction === 'in' ? '' : '-'}${money(m)}`,
    });
  }
  if (shift.closed) {
    for (const e of shift.closed.expected_cash) blocks.push({ kind: 'columns', left: 'Expected', right: money(e) });
    for (const c of shift.closed.counted_cash) blocks.push({ kind: 'columns', left: 'Counted', right: money(c) });
    for (const v of cashVariance(shift.closed.expected_cash, shift.closed.counted_cash)) {
      blocks.push({ kind: 'columns', left: v.amount_minor === 0 ? `${v.currency} balances` : v.amount_minor > 0 ? 'Over' : 'Short', right: signed(v) });
    }
    if (shift.closed.note) blocks.push({ kind: 'text', text: `Note: ${shift.closed.note}` });
  }
  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'text', text: 'Not a fiscal document', align: 'center' });
  blocks.push({ kind: 'feed', lines: 3 });
  blocks.push({ kind: 'cut' });
  return { widthChars, blocks };
}
