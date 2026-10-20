/**
 * Money is always held as an integer count of the currency's minor unit
 * (e.g. cents). Floating-point arithmetic is never used for amounts.
 */

export const CURRENCIES = {
  USD: { code: 'USD', minorUnits: 2 },
  ZWG: { code: 'ZWG', minorUnits: 2 },
  ZAR: { code: 'ZAR', minorUnits: 2 },
  BWP: { code: 'BWP', minorUnits: 2 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as [CurrencyCode, ...CurrencyCode[]];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

/** Half away from zero is the common commercial rule; half-even is offered for regimes that require it. */
export type RoundingMode = 'half_away_from_zero' | 'half_even';

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

export function assertMinorAmount(amount: number, label = 'amount'): void {
  if (!Number.isSafeInteger(amount)) {
    throw new MoneyError(`${label} must be a safe integer number of minor units, got ${amount}`);
  }
}

export function money(amount: number, currency: CurrencyCode): Money {
  assertMinorAmount(amount);
  if (!isCurrencyCode(currency)) throw new MoneyError(`Unsupported currency ${String(currency)}`);
  return { amount, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), money(0, currency));
}

/**
 * Integer division with explicit rounding. Works for negative numerators.
 * The quotient is corrected after the float estimate so large values stay exact.
 */
export function divRound(numerator: number, denominator: number, mode: RoundingMode): number {
  assertMinorAmount(numerator, 'numerator');
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new MoneyError(`denominator must be a positive safe integer, got ${denominator}`);
  }
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  let q = Math.floor(n / denominator);
  while (q * denominator > n) q--;
  while ((q + 1) * denominator <= n) q++;
  const twiceRemainder = (n - q * denominator) * 2;
  if (twiceRemainder > denominator) q++;
  else if (twiceRemainder === denominator) {
    if (mode === 'half_away_from_zero' || q % 2 !== 0) q++;
  }
  return q === 0 ? 0 : sign * q;
}

function checkedProduct(a: number, b: number): number {
  const product = a * b;
  if (!Number.isSafeInteger(product)) throw new MoneyError(`Overflow multiplying ${a} by ${b}`);
  return product;
}

/** Quantity is expressed in thousandths (1000 = one unit) so weighed goods need no floats. */
export function extendPrice(unitPriceMinor: number, quantityMilli: number, mode: RoundingMode): number {
  assertMinorAmount(unitPriceMinor, 'unitPriceMinor');
  if (!Number.isSafeInteger(quantityMilli)) throw new MoneyError('quantityMilli must be an integer');
  return divRound(checkedProduct(unitPriceMinor, quantityMilli), 1000, mode);
}

/** Basis points: 1500 = 15.00%. */
export function percentOf(amountMinor: number, basisPoints: number, mode: RoundingMode): number {
  return divRound(checkedProduct(amountMinor, basisPoints), 10_000, mode);
}

/** Tax contained in a tax-inclusive gross amount. */
export function inclusiveTax(grossMinor: number, rateBasisPoints: number, mode: RoundingMode): number {
  const net = divRound(checkedProduct(grossMinor, 10_000), 10_000 + rateBasisPoints, mode);
  return grossMinor - net;
}

/**
 * Split an amount across weights using the largest-remainder method, so the
 * parts always add back to the exact total (used for discounts and split tender).
 */
export function allocate(totalMinor: number, weights: readonly number[]): number[] {
  assertMinorAmount(totalMinor, 'totalMinor');
  if (weights.length === 0) throw new MoneyError('allocate needs at least one weight');
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new MoneyError('weights must be non-negative integers');
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) throw new MoneyError('weights must not all be zero');

  const sign = totalMinor < 0 ? -1 : 1;
  const abs = Math.abs(totalMinor);
  const parts = weights.map((w) => {
    const raw = checkedProduct(abs, w);
    return { floor: Math.floor(raw / totalWeight), remainder: raw % totalWeight };
  });
  let leftover = abs - parts.reduce((a, p) => a + p.floor, 0);
  const order = parts
    .map((p, index) => ({ index, remainder: p.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const result = parts.map((p) => p.floor);
  for (const { index } of order) {
    if (leftover === 0) break;
    result[index] = (result[index] ?? 0) + 1;
    leftover--;
  }
  return result.map((r) => (r === 0 ? 0 : r * sign));
}

/** Parse a decimal string such as "12.50" without going through floating point. */
export function parseMajor(input: string, currency: CurrencyCode): Money {
  const { minorUnits } = CURRENCIES[currency];
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) throw new MoneyError(`Not a decimal amount: "${input}"`);
  const [, minus, whole = '0', fraction = ''] = match;
  if (fraction.length > minorUnits) {
    throw new MoneyError(`${currency} allows at most ${minorUnits} decimal places: "${input}"`);
  }
  const amount = Number(`${whole}${fraction.padEnd(minorUnits, '0')}`);
  assertMinorAmount(amount);
  return money(minus && amount !== 0 ? -amount : amount, currency);
}

/** Plain decimal rendering ("1234.50"); locale formatting belongs to the UI layer. */
export function formatMajor(value: Money): string {
  const minorUnits: number = CURRENCIES[value.currency].minorUnits;
  const abs = Math.abs(value.amount).toString().padStart(minorUnits + 1, '0');
  const whole = abs.slice(0, abs.length - minorUnits);
  const fraction = abs.slice(abs.length - minorUnits);
  const sign = value.amount < 0 ? '-' : '';
  return minorUnits === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}
