import type { ApiClient } from '@inkypos/core';
import { amount, quantity, type ExportDocument, type ExportTable } from './export';

/**
 * Report data → export tables. Amounts are plain numbers in the currency named
 * in the column heading, so a spreadsheet can total them.
 */

type Doc = Omit<ExportDocument, 'business' | 'filename'>;
type Sales = Awaited<ReturnType<ApiClient['salesReport']>>;
type Vat = Awaited<ReturnType<ApiClient['vatReport']>>;
type Shifts = Awaited<ReturnType<ApiClient['shiftReports']>>;
type Profit = Awaited<ReturnType<ApiClient['profitReport']>>;
type Audit = Awaited<ReturnType<ApiClient['auditLog']>>;
type Cashbook = Awaited<ReturnType<ApiClient['cashbook']>>;
type Expenses = Awaited<ReturnType<ApiClient['listExpenses']>>;
type Balances = Awaited<ReturnType<ApiClient['supplierBalances']>>;
type Stock = Awaited<ReturnType<ApiClient['stockLevels']>>;

const day = (iso: string) => iso.slice(0, 10);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '');

export function salesDocument(s: Sales, vat: Vat | null): Doc {
  const c = s.currency;
  const tables: ExportTable[] = [
    {
      title: 'Totals',
      columns: ['Sales', `Takings (${c})`, `Refunds (${c})`, `Tax (${c})`, `Net (${c})`, `Average sale (${c})`, `Change given (${c})`],
      rows: [[s.totals.sales_count, amount(s.totals.sales_minor), amount(s.totals.refunds_minor), amount(s.totals.tax_minor), amount(s.totals.net_minor), amount(s.totals.average_sale_minor), amount(s.change_given_minor)]],
    },
    {
      title: 'By day',
      columns: ['Day', 'Sales', `Takings (${c})`, 'Refunds', `Refunded (${c})`, `Tax (${c})`, `Net (${c})`],
      rows: s.days.map((d) => [d.date, d.sales_count, amount(d.sales_minor), d.refunds_count, amount(d.refunds_minor), amount(d.tax_minor), amount(d.net_minor)]),
    },
    {
      title: 'By payment type',
      columns: ['Payment type', 'Currency', 'Payments', 'Taken', 'Awaiting confirmation', 'Refunded'],
      rows: s.payments.map((p) => [p.name, p.currency, p.count, amount(p.tendered_minor), amount(p.pending_minor), amount(p.refunded_minor)]),
    },
    { title: 'By cashier', columns: ['Cashier', 'Sales', `Takings (${c})`], rows: s.by_cashier.map((r) => [r.name, r.sales_count, amount(r.sales_minor)]) },
    { title: 'By till', columns: ['Till', 'Sales', `Takings (${c})`], rows: s.by_register.map((r) => [r.name, r.sales_count, amount(r.sales_minor)]) },
    { title: 'Best sellers', columns: ['Product', 'Quantity', `Sales (${c})`], rows: s.top_products.map((p) => [p.name, quantity(p.quantity_milli), amount(p.sales_minor)]) },
  ];
  if (vat) {
    tables.push({
      title: 'VAT summary',
      columns: ['Tax code', 'Rate (%)', `Net taxable (${vat.currency})`, `Net tax (${vat.currency})`],
      rows: vat.lines.map((l) => [l.tax_code, l.rate_bp / 100, amount(l.net_taxable_minor), amount(l.net_tax_minor)]),
      note: vat.notice,
    });
  }
  return { title: 'Sales report', period: `${s.from} to ${s.to}`, tables };
}

export function shiftsDocument(list: Shifts, period: { from: string; to: string }): Doc {
  return {
    title: 'Shifts',
    period: `${period.from} to ${period.to}`,
    tables: [
      {
        title: 'Shifts',
        columns: ['Till', 'Opened by', 'Opened', 'Closed', 'Sales', 'Takings', 'Currency', 'Cash over (+) / short (-)'],
        rows: list.map((s) => [
          s.register,
          s.opened_by,
          when(s.opened_at),
          s.closed_at ? when(s.closed_at) : 'Open',
          s.sales_count,
          amount(s.sales_minor),
          s.currency,
          s.variance ? s.variance.map((v) => `${v.currency} ${amount(v.amount_minor)}`).join('; ') : '',
        ]),
      },
    ],
  };
}

export function profitDocument(r: Profit): Doc {
  const c = r.currency;
  return {
    title: 'Profit (estimate)',
    period: `${r.from} to ${r.to}`,
    tables: [
      {
        title: 'Profit',
        columns: ['Line', `Amount (${c})`],
        rows: [
          ['Net sales (excluding tax)', amount(r.net_sales_minor)],
          ['Cost of goods sold', -amount(r.cost_of_goods_minor)],
          ['Gross profit', amount(r.gross_profit_minor)],
          ['Expenses', -amount(r.expenses_minor)],
          ['Net profit', amount(r.net_profit_minor)],
          ...(r.uncosted_lines > 0 ? ([[`Sales without a cost (${r.uncosted_lines} lines, not in cost of goods)`, amount(r.uncosted_sales_minor)]] as [string, number][]) : []),
          ...r.expenses_in_other_currencies.map((e) => [`Expenses in ${e.currency} (not converted, not included)`, amount(e.amount_minor)] as [string, number]),
        ],
        note: r.notice,
      },
    ],
  };
}

export function activityDocument(log: Audit): Doc {
  return {
    title: 'Activity log',
    tables: [
      {
        title: 'Latest activity',
        columns: ['When', 'What', 'Who'],
        rows: log.map((e) => [when(e.created_at), e.action.replace(/[._]/g, ' '), e.actor ?? (e.actor_type === 'platform' ? 'Inkgenius Technologies' : e.actor_type)]),
      },
    ],
  };
}

export function cashbookDocument(b: Cashbook, period: { from: string; to: string }): Doc {
  return {
    title: 'Cash book',
    period: `${period.from} to ${period.to}`,
    tables: [
      { title: 'Totals', columns: ['Currency', 'In', 'Out', 'Net'], rows: b.totals.map((t) => [t.currency, amount(t.in_minor), amount(t.out_minor), amount(t.net_minor)]) },
      {
        title: 'Entries',
        columns: ['Date', 'What', 'How', 'Currency', 'In', 'Out', 'Not yet confirmed'],
        rows: b.entries.map((e) => [e.date, e.description, e.method, e.currency, amount(e.in_minor), amount(e.out_minor), amount(e.pending_minor)]),
      },
    ],
  };
}

export function expensesDocument(list: Expenses, period: { from: string; to: string }): Doc {
  return {
    title: 'Expenses',
    period: `${period.from} to ${period.to}`,
    tables: [
      {
        title: 'Expenses',
        columns: ['Date', 'What', 'Category', 'Paid from', 'Reference', 'Currency', 'Amount'],
        rows: list.map((e) => [day(e.spent_at), e.description, e.category, e.paid_from.replace('_', ' '), e.reference, e.currency, amount(e.amount_minor)]),
      },
    ],
  };
}

export function supplierBalancesDocument(b: Balances): Doc {
  const c = b.currency;
  return {
    title: 'Owed to suppliers',
    tables: [
      {
        title: 'Suppliers',
        columns: ['Supplier', `Delivered (${c})`, `Paid (${c})`, `Owed (${c})`, 'Paid in other currencies'],
        rows: b.suppliers.map((s) => [
          s.name,
          amount(s.deliveries_minor),
          amount(s.paid_minor),
          amount(s.balance_minor),
          s.paid_in_other_currencies.map((o) => `${o.currency} ${amount(o.amount_minor)}`).join('; '),
        ]),
      },
    ],
  };
}

export function stockDocument(s: Stock, branchName: string | null): Doc {
  const c = s.currency;
  return {
    title: branchName ? `Stock · ${branchName}` : 'Stock',
    tables: [
      {
        title: 'Stock on hand',
        columns: ['Product', 'SKU', 'Unit', 'On hand', 'Low at', 'Low', `Value at last cost (${c})`],
        rows: s.items.map((i) => [
          i.name,
          i.sku,
          i.unit,
          quantity(i.on_hand_milli),
          i.reorder_level_milli === null ? null : quantity(i.reorder_level_milli),
          i.low ? 'Yes' : '',
          i.value_minor === null ? null : amount(i.value_minor),
        ]),
        note: `Total value at last cost: ${c} ${amount(s.total_value_minor).toFixed(2)}`,
      },
    ],
  };
}
