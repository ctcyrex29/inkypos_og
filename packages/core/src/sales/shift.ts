import type { CurrencyCode } from '../money/money';
import { TENDERING_PAYMENT_STATUSES, type CashMovementPayload, type RefundIssuedPayload, type SaleCompletedPayload } from '../sync/events';

export interface CurrencyAmount {
  currency: CurrencyCode;
  amount_minor: number;
}

export interface DrawerInput {
  openingFloat: CurrencyAmount[];
  sales: SaleCompletedPayload[];
  refunds: RefundIssuedPayload[];
  movements: CashMovementPayload[];
  /** Payment method codes that are physical cash in the drawer. */
  cashMethodCodes: ReadonlySet<string>;
}

/**
 * Cash the drawer should hold, per currency: opening float, plus cash taken
 * in each currency, minus change given (always in the sale currency), minus
 * cash refunds, plus/minus pay-ins and pay-outs. Non-cash tenders never count.
 */
export function expectedCash(input: DrawerInput): CurrencyAmount[] {
  const totals = new Map<CurrencyCode, number>();
  const add = (currency: CurrencyCode, minor: number) => totals.set(currency, (totals.get(currency) ?? 0) + minor);

  for (const f of input.openingFloat) add(f.currency, f.amount_minor);
  for (const sale of input.sales) {
    for (const p of sale.payments) {
      if (input.cashMethodCodes.has(p.method_code) && TENDERING_PAYMENT_STATUSES.includes(p.status)) add(p.currency, p.amount_minor);
    }
    if (sale.change_minor > 0) add(sale.currency, -sale.change_minor);
  }
  for (const refund of input.refunds) {
    for (const p of refund.payments) if (input.cashMethodCodes.has(p.method_code)) add(p.currency, -p.amount_minor);
  }
  for (const m of input.movements) add(m.currency, m.direction === 'in' ? m.amount_minor : -m.amount_minor);

  return [...totals.entries()].map(([currency, amount_minor]) => ({ currency, amount_minor })).sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Counted minus expected, per currency (positive = over, negative = short). */
export function cashVariance(expected: CurrencyAmount[], counted: CurrencyAmount[]): CurrencyAmount[] {
  const currencies = [...new Set([...expected, ...counted].map((r) => r.currency))].sort();
  const of = (rows: CurrencyAmount[], c: CurrencyCode) => rows.find((r) => r.currency === c)?.amount_minor ?? 0;
  return currencies.map((currency) => ({ currency, amount_minor: of(counted, currency) - of(expected, currency) }));
}
