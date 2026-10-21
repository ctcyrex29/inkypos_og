import { z } from 'zod';
import { currencySchema } from '../sync/events';

/**
 * Report and accounting payloads (managers, online). Mirrors
 * apps/api/app/Reports/Reports.php and AccountingController. Amounts are
 * integer minor units in the currency stated; nothing is converted.
 */

const id = z.uuid();
const amount = z.int();
const currencyAmount = z.object({ currency: currencySchema, amount_minor: amount });

export const paymentBreakdownSchema = z.object({
  method_code: z.string(),
  name: z.string(),
  currency: currencySchema,
  count: z.int(),
  tendered_minor: amount,
  /** Recorded as awaiting confirmation (EcoCash, transfers): not yet known to have settled. */
  pending_minor: amount,
  refunded_minor: amount,
});

export const salesReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  timezone: z.string(),
  currency: currencySchema,
  days: z.array(
    z.object({
      date: z.string(),
      sales_count: z.int(),
      sales_minor: amount,
      tax_minor: amount,
      discount_minor: amount,
      refunds_count: z.int(),
      refunds_minor: amount,
      refund_tax_minor: amount,
      net_minor: amount,
    }),
  ),
  totals: z.object({
    sales_count: z.int(),
    sales_minor: amount,
    tax_minor: amount,
    discount_minor: amount,
    refunds_count: z.int(),
    refunds_minor: amount,
    refund_tax_minor: amount,
    net_minor: amount,
    average_sale_minor: amount,
  }),
  payments: z.array(paymentBreakdownSchema),
  change_given_minor: amount,
  by_cashier: z.array(z.object({ user_id: z.string(), name: z.string(), sales_count: z.int(), sales_minor: amount })),
  by_register: z.array(z.object({ register_id: z.string(), name: z.string(), sales_count: z.int(), sales_minor: amount })),
  top_products: z.array(z.object({ product_id: z.string(), name: z.string(), quantity_milli: z.int(), sales_minor: amount })),
});
export type SalesReport = z.infer<typeof salesReportSchema>;

export const vatReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: currencySchema,
  lines: z.array(
    z.object({
      tax_code: z.string(),
      rate_bp: z.int(),
      sales_total_minor: amount,
      sales_tax_minor: amount,
      refunds_total_minor: amount,
      refunds_tax_minor: amount,
      net_taxable_minor: amount,
      net_tax_minor: amount,
    }),
  ),
  net_tax_minor: amount,
  net_taxable_minor: amount,
  notice: z.string(),
});
export type VatReport = z.infer<typeof vatReportSchema>;

export const profitReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: currencySchema,
  net_sales_minor: amount,
  cost_of_goods_minor: amount,
  gross_profit_minor: amount,
  expenses_minor: amount,
  net_profit_minor: amount,
  uncosted_lines: z.int(),
  uncosted_sales_minor: amount,
  expenses_in_other_currencies: z.array(currencyAmount),
  notice: z.string(),
});
export type ProfitReport = z.infer<typeof profitReportSchema>;

export const shiftListItemSchema = z.object({
  shift_id: id,
  /** Sales totals are in this (the base) currency; cash rows carry their own. */
  currency: currencySchema,
  register: z.string(),
  opened_by: z.string(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  sales_count: z.int(),
  sales_minor: amount,
  /** counted − expected per currency; null while the shift is open. */
  variance: z.array(currencyAmount).nullable(),
});
export type ShiftListItem = z.infer<typeof shiftListItemSchema>;

export const shiftZReportSchema = z.object({
  shift_id: id,
  currency: currencySchema,
  register: z.string().nullable(),
  opened_by: z.string(),
  closed_by: z.string().nullable(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  opening_float: z.array(currencyAmount),
  sales_count: z.int(),
  sales_minor: amount,
  tax_minor: amount,
  discount_minor: amount,
  change_given_minor: amount,
  refunds_count: z.int(),
  voids_count: z.int(),
  refunds_minor: amount,
  payments: z.array(paymentBreakdownSchema),
  cash_movements: z.array(
    z.object({ direction: z.enum(['in', 'out']), currency: currencySchema, amount_minor: amount, reason: z.string(), note: z.string().nullable(), occurred_at: z.string() }),
  ),
  expected_cash: z.array(currencyAmount).nullable(),
  counted_cash: z.array(currencyAmount).nullable(),
  variance: z.array(currencyAmount).nullable(),
  note: z.string().nullable(),
});
export type ShiftZReport = z.infer<typeof shiftZReportSchema>;

export const auditEntrySchema = z.object({
  id,
  action: z.string(),
  actor_type: z.string(),
  actor: z.string().nullable(),
  subject_type: z.string().nullable(),
  subject_id: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const EXPENSE_CATEGORIES = ['rent', 'utilities', 'wages', 'transport', 'supplies', 'repairs', 'fees', 'other'] as const;
export const PAID_FROM = ['bank', 'mobile_money', 'cash_office', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type PaidFrom = (typeof PAID_FROM)[number];

export const expenseSchema = z.object({
  id,
  branch_id: id.nullable(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string(),
  currency: currencySchema,
  amount_minor: amount,
  paid_from: z.enum(PAID_FROM),
  reference: z.string().nullable(),
  spent_at: z.string(),
});
export type Expense = z.infer<typeof expenseSchema>;

export interface ExpenseInput {
  branch_id?: string;
  category: ExpenseCategory;
  description: string;
  currency: string;
  /** Negative only to reverse an earlier entry. */
  amount_minor: number;
  paid_from: PaidFrom;
  reference?: string;
  spent_at?: string;
}

export const supplierPaymentSchema = z.object({
  id,
  supplier_id: id,
  currency: currencySchema,
  amount_minor: amount,
  paid_from: z.enum(PAID_FROM),
  reference: z.string().nullable(),
  paid_at: z.string(),
});

export interface SupplierPaymentInput {
  supplier_id: string;
  currency: string;
  amount_minor: number;
  paid_from: PaidFrom;
  reference?: string;
  paid_at?: string;
}

export const supplierBalancesSchema = z.object({
  currency: currencySchema,
  suppliers: z.array(
    z.object({
      supplier_id: id,
      name: z.string(),
      active: z.boolean(),
      deliveries_minor: amount,
      paid_minor: amount,
      balance_minor: amount,
      paid_in_other_currencies: z.array(currencyAmount),
    }),
  ),
});
export type SupplierBalances = z.infer<typeof supplierBalancesSchema>;

export const cashbookSchema = z.object({
  from: z.string(),
  to: z.string(),
  timezone: z.string(),
  entries: z.array(
    z.object({
      date: z.string(),
      kind: z.enum(['takings', 'change', 'refund', 'drawer', 'expense', 'supplier']),
      description: z.string(),
      method: z.string(),
      currency: currencySchema,
      in_minor: amount,
      out_minor: amount,
      pending_minor: amount,
    }),
  ),
  totals: z.array(z.object({ currency: currencySchema, in_minor: amount, out_minor: amount, net_minor: amount })),
});
export type Cashbook = z.infer<typeof cashbookSchema>;

/** A reporting period of local days, from and to inclusive (YYYY-MM-DD). */
export interface Period {
  from: string;
  to: string;
  branchId?: string;
}

export function periodQuery(p: Period): string {
  return new URLSearchParams({ from: p.from, to: p.to, ...(p.branchId ? { branch_id: p.branchId } : {}) }).toString();
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Common periods relative to `today` (the device's local date). */
export function presetPeriod(preset: 'today' | 'yesterday' | 'last7' | 'month' | 'lastMonth', today: Date = new Date()): Period {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const minus = (days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - days);
  switch (preset) {
    case 'today':
      return { from: ymd(d), to: ymd(d) };
    case 'yesterday':
      return { from: ymd(minus(1)), to: ymd(minus(1)) };
    case 'last7':
      return { from: ymd(minus(6)), to: ymd(d) };
    case 'month':
      return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(d) };
    case 'lastMonth':
      return { from: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: ymd(new Date(d.getFullYear(), d.getMonth(), 0)) };
  }
}
