import type { BusinessInfo, ExchangeRateInfo, PaymentMethodInfo } from '../catalogue/contracts';
import type { CurrencyCode, RoundingMode } from '../money/money';
import type { CatalogueProduct, UnsequencedSaleEvent } from '../storage/ports';
import type { PaymentStatus } from '../sync/events';
import { priceLine, type LinePricing } from './pricing';

/**
 * Checkout as pure functions over an immutable cart. The UI holds the cart in
 * state; completeCart() turns it into a sale event that always passes the
 * shared sync schema (and therefore the server's checks).
 */

export class CheckoutError extends Error {
  override readonly name = 'CheckoutError';
  constructor(
    readonly code:
      | 'inactive_product'
      | 'bad_quantity'
      | 'bad_discount'
      | 'currency_not_accepted'
      | 'no_rate'
      | 'reference_required'
      | 'bad_amount'
      | 'exceeds_due'
      | 'nothing_to_sell'
      | 'not_paid'
      | 'unknown_line',
    message: string,
  ) {
    super(message);
  }
}

export interface CartLine {
  line_id: string;
  product: CatalogueProduct;
  quantity_milli: number;
  discount_minor: number;
}

export interface CartTender {
  payment_id: string;
  method: PaymentMethodInfo;
  currency: CurrencyCode;
  amount_minor: number;
  sale_currency_amount_minor: number;
  exchange_rate?: string;
  exchange_rate_version?: number;
  reference?: string;
  status: PaymentStatus;
}

export interface Cart {
  currency: CurrencyCode;
  rounding: RoundingMode;
  lines: CartLine[];
  tenders: CartTender[];
}

export interface PricedCart {
  lines: { line: CartLine; priced: LinePricing }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  tendered: number;
  /** Still to pay, in the sale currency. */
  remaining: number;
  change: number;
}

const TENDERING: PaymentStatus[] = ['recorded', 'pending_confirmation', 'confirmed'];

export function emptyCart(business: Pick<BusinessInfo, 'base_currency' | 'rounding'>): Cart {
  return { currency: business.base_currency, rounding: business.rounding, lines: [], tenders: [] };
}

// ── Lines ─────────────────────────────────────────────────────────────────

/** Scanning the same counted item again adds one to its line; weighed items always get a new line. */
export function addProduct(cart: Cart, product: CatalogueProduct, newId: () => string, quantityMilli = 1000): Cart {
  if (!product.active) throw new CheckoutError('inactive_product', `${product.name} is not for sale.`);
  assertQuantity(quantityMilli);
  const existing = product.unit === 'each' ? cart.lines.find((l) => l.product.product_id === product.product_id && l.discount_minor === 0) : undefined;
  const lines = existing
    ? cart.lines.map((l) => (l === existing ? { ...l, quantity_milli: l.quantity_milli + quantityMilli } : l))
    : [...cart.lines, { line_id: newId(), product, quantity_milli: quantityMilli, discount_minor: 0 }];
  return { ...cart, lines };
}

export function setQuantity(cart: Cart, lineId: string, quantityMilli: number): Cart {
  findLine(cart, lineId);
  if (quantityMilli <= 0) return removeLine(cart, lineId);
  assertQuantity(quantityMilli);
  const lines = cart.lines.map((l) => (l.line_id === lineId ? { ...l, quantity_milli: quantityMilli } : l));
  // A smaller line may no longer support its discount.
  for (const l of lines) priceOf(cart, l);
  return { ...cart, lines };
}

export function setLineDiscount(cart: Cart, lineId: string, discountMinor: number): Cart {
  const line = findLine(cart, lineId);
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0) throw new CheckoutError('bad_discount', 'Discount must be zero or more.');
  const updated = { ...line, discount_minor: discountMinor };
  priceOf(cart, updated); // throws if larger than the line
  return { ...cart, lines: cart.lines.map((l) => (l.line_id === lineId ? updated : l)) };
}

export function removeLine(cart: Cart, lineId: string): Cart {
  findLine(cart, lineId);
  return { ...cart, lines: cart.lines.filter((l) => l.line_id !== lineId) };
}

function findLine(cart: Cart, lineId: string): CartLine {
  const line = cart.lines.find((l) => l.line_id === lineId);
  if (!line) throw new CheckoutError('unknown_line', 'That line is no longer in the sale.');
  return line;
}

function assertQuantity(q: number): void {
  if (!Number.isSafeInteger(q) || q <= 0 || q > 1_000_000_000) throw new CheckoutError('bad_quantity', 'Quantity must be more than zero.');
}

function priceOf(cart: Cart, line: CartLine): LinePricing {
  try {
    return priceLine({
      unitPriceMinor: line.product.unit_price_minor,
      quantityMilli: line.quantity_milli,
      discountMinor: line.discount_minor,
      taxRateBasisPoints: line.product.tax_rate_bp,
      taxInclusive: line.product.tax_inclusive,
      rounding: cart.rounding,
    });
  } catch (e) {
    throw new CheckoutError('bad_discount', (e as Error).message);
  }
}

// ── Totals ────────────────────────────────────────────────────────────────

export function priceCart(cart: Cart): PricedCart {
  const lines = cart.lines.map((line) => ({ line, priced: priceOf(cart, line) }));
  const sum = (f: (p: LinePricing) => number) => lines.reduce((s, l) => s + f(l.priced), 0);
  const total = sum((p) => p.totalMinor);
  const tendered = cart.tenders.filter((t) => TENDERING.includes(t.status)).reduce((s, t) => s + t.sale_currency_amount_minor, 0);
  return {
    lines,
    subtotal: sum((p) => p.extendedMinor),
    discount: sum((p) => p.discountMinor),
    tax: sum((p) => p.taxMinor),
    total,
    tendered,
    remaining: Math.max(0, total - tendered),
    change: Math.max(0, tendered - total),
  };
}

// ── Currency conversion ───────────────────────────────────────────────────

const RATE_SCALE = 100_000_000n; // rates carry at most 8 decimals

function scaledRate(rate: string): bigint {
  const [whole = '0', fraction = ''] = rate.split('.');
  return BigInt(whole) * RATE_SCALE + BigInt(fraction.padEnd(8, '0'));
}

function bigDivRound(n: bigint, d: bigint, mode: RoundingMode): bigint {
  const q = n / d;
  const twice = (n % d) * 2n;
  if (twice > d || (twice === d && (mode === 'half_away_from_zero' || q % 2n !== 0n))) return q + 1n;
  return q;
}

/** Quote-currency minor units → sale-currency minor units at `rate` (sale units per quote unit). */
export function convertToSaleCurrency(quoteMinor: number, rate: string, mode: RoundingMode): number {
  if (!Number.isSafeInteger(quoteMinor) || quoteMinor < 0) throw new CheckoutError('bad_amount', 'Amount must be zero or more.');
  const result = bigDivRound(BigInt(quoteMinor) * scaledRate(rate), RATE_SCALE, mode);
  return Number(result);
}

/** Smallest quote-currency amount that covers `saleMinor` (what to ask a customer paying in that currency). */
export function quoteAmountToCover(saleMinor: number, rate: string): number {
  const r = scaledRate(rate);
  if (r === 0n) throw new CheckoutError('no_rate', 'Exchange rate is zero.');
  return Number((BigInt(saleMinor) * RATE_SCALE + r - 1n) / r);
}

// ── Tenders ───────────────────────────────────────────────────────────────

export interface TenderInput {
  method: PaymentMethodInfo;
  currency: CurrencyCode;
  amount_minor: number;
  reference?: string;
}

export function addTender(
  cart: Cart,
  input: TenderInput,
  ctx: { newId: () => string; rateFor: (quote: CurrencyCode) => ExchangeRateInfo | null },
): Cart {
  const { method, currency } = input;
  if (!method.currencies.includes(currency)) {
    throw new CheckoutError('currency_not_accepted', `${method.name} does not accept ${currency}.`);
  }
  const reference = input.reference?.trim();
  if (method.requires_reference && !reference) {
    throw new CheckoutError('reference_required', `Enter the ${method.name} reference.`);
  }
  if (!Number.isSafeInteger(input.amount_minor) || input.amount_minor <= 0) {
    throw new CheckoutError('bad_amount', 'Enter an amount above zero, like 12.50.');
  }

  let saleAmount = input.amount_minor;
  let rate: ExchangeRateInfo | null = null;
  if (currency !== cart.currency) {
    rate = ctx.rateFor(currency);
    if (!rate) throw new CheckoutError('no_rate', `No ${currency} exchange rate has been set. Ask a manager.`);
    saleAmount = convertToSaleCurrency(input.amount_minor, rate.rate, cart.rounding);
    if (saleAmount <= 0) throw new CheckoutError('bad_amount', 'Amount is too small to count.');
  }

  const { remaining } = priceCart(cart);
  if (!method.gives_change && saleAmount > remaining) {
    // Paying the "amount to cover" in another currency can exceed the balance by
    // rounding alone; that cent is absorbed, anything more is refused.
    const slack = rate ? convertToSaleCurrency(1, rate.rate, 'half_away_from_zero') + 1 : 0;
    if (saleAmount - remaining > slack || remaining === 0) {
      throw new CheckoutError('exceeds_due', `${method.name} cannot be more than the amount due; it gives no change.`);
    }
    saleAmount = remaining;
  }

  const tender: CartTender = {
    payment_id: ctx.newId(),
    method,
    currency,
    amount_minor: input.amount_minor,
    sale_currency_amount_minor: saleAmount,
    status: method.initial_status,
    ...(rate ? { exchange_rate: rate.rate, exchange_rate_version: rate.version } : {}),
    ...(reference ? { reference } : {}),
  };
  return { ...cart, tenders: [...cart.tenders, tender] };
}

export function removeTender(cart: Cart, paymentId: string): Cart {
  return { ...cart, tenders: cart.tenders.filter((t) => t.payment_id !== paymentId) };
}

export function canComplete(cart: Cart): { ok: true } | { ok: false; code: CheckoutError['code']; message: string } {
  if (cart.lines.length === 0) return { ok: false, code: 'nothing_to_sell', message: 'Add at least one item.' };
  const p = priceCart(cart);
  if (p.total === 0) {
    // Every sale carries at least one payment; free goods are a stock adjustment, not a sale.
    return { ok: false, code: 'nothing_to_sell', message: 'The total is zero. Record free items as a stock adjustment.' };
  }
  if (p.remaining > 0) return { ok: false, code: 'not_paid', message: 'The sale is not fully paid.' };
  if (p.change > 0 && !cart.tenders.some((t) => t.method.gives_change)) {
    return { ok: false, code: 'exceeds_due', message: 'Overpaid with a payment type that gives no change.' };
  }
  return { ok: true };
}

// ── Completion ────────────────────────────────────────────────────────────

export interface CompleteContext {
  newId: () => string;
  tenantId: string;
  branchId: string;
  registerId: string;
  deviceId: string;
  actorId: string;
  catalogueVersion: number;
  now: () => Date;
}

/** Builds the sale event. The receipt number is filled in at commit, from the allocated sequence. */
export function completeCart(cart: Cart, ctx: CompleteContext): UnsequencedSaleEvent {
  const check = canComplete(cart);
  if (!check.ok) throw new CheckoutError(check.code, check.message);
  const priced = priceCart(cart);
  const saleId = ctx.newId();
  const completedAt = ctx.now().toISOString();

  return {
    schema_version: 1,
    event_id: ctx.newId(),
    event_type: 'sale.completed',
    occurred_at: completedAt,
    tenant_id: ctx.tenantId,
    branch_id: ctx.branchId,
    register_id: ctx.registerId,
    device_id: ctx.deviceId,
    actor_user_id: ctx.actorId,
    aggregate_id: saleId,
    payload: {
      sale_id: saleId,
      receipt_number: 'PENDING',
      currency: cart.currency,
      rounding: cart.rounding,
      catalogue_version: ctx.catalogueVersion,
      price_list_version: ctx.catalogueVersion,
      completed_at: completedAt,
      lines: priced.lines.map(({ line, priced: p }) => ({
        line_id: line.line_id,
        product_id: line.product.product_id,
        sku: line.product.sku,
        name: line.product.name,
        quantity_milli: line.quantity_milli,
        unit_price_minor: line.product.unit_price_minor,
        discount_minor: line.discount_minor,
        tax: { code: line.product.tax_code, rate_bp: line.product.tax_rate_bp, inclusive: line.product.tax_inclusive, amount_minor: p.taxMinor },
        line_total_minor: p.totalMinor,
      })),
      totals: { subtotal_minor: priced.subtotal, discount_minor: priced.discount, tax_minor: priced.tax, total_minor: priced.total },
      payments: cart.tenders.map((t) => ({
        payment_id: t.payment_id,
        method_code: t.method.code,
        status: t.status,
        currency: t.currency,
        amount_minor: t.amount_minor,
        sale_currency_amount_minor: t.sale_currency_amount_minor,
        ...(t.exchange_rate ? { exchange_rate: t.exchange_rate } : {}),
        ...(t.exchange_rate_version ? { exchange_rate_version: t.exchange_rate_version } : {}),
        ...(t.reference ? { reference: t.reference } : {}),
      })),
      change_minor: priced.change,
      stock_movements: cart.lines.map((l) => ({ movement_id: ctx.newId(), product_id: l.product.product_id, quantity_delta_milli: -l.quantity_milli })),
    },
  };
}

/** Major-unit text ("12.5") → minor units, for keypad input. Returns null when not a valid amount. */
export function parseAmount(text: string, minorUnits = 2): number | null {
  const m = /^\s*(\d{1,12})(?:[.,](\d*))?\s*$/.exec(text);
  if (!m) return null;
  const fraction = (m[2] ?? '').slice(0, minorUnits + 1);
  if (fraction.length > minorUnits) return null;
  return Number(m[1]) * 10 ** minorUnits + Number(fraction.padEnd(minorUnits, '0') || '0');
}

/** "1.25" kg → 1250 thousandths. */
export function parseQuantity(text: string): number | null {
  const m = /^\s*(\d{1,6})(?:[.,](\d{0,3}))?\s*$/.exec(text);
  if (!m) return null;
  const milli = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0') || '0');
  return milli > 0 ? milli : null;
}

