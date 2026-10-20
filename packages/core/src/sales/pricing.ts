import { extendPrice, inclusiveTax, MoneyError, percentOf, type RoundingMode } from '../money/money';

export interface LinePricingInput {
  unitPriceMinor: number;
  quantityMilli: number;
  discountMinor: number;
  taxRateBasisPoints: number;
  taxInclusive: boolean;
  rounding: RoundingMode;
}

export interface LinePricing {
  extendedMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * The single shared rule for pricing a sale line. Checkout uses it to build
 * lines and the sync schema uses it to verify uploaded sales.
 *
 * Tax is computed per line. Whether a fiscal regime requires invoice-level
 * rounding instead is an open item for the fiscalisation phase.
 */
export function priceLine(input: LinePricingInput): LinePricing {
  const extendedMinor = extendPrice(input.unitPriceMinor, input.quantityMilli, input.rounding);
  if (input.discountMinor < 0 || input.discountMinor > extendedMinor) {
    throw new MoneyError('Line discount must be between zero and the extended price');
  }
  const taxable = extendedMinor - input.discountMinor;
  const taxMinor = input.taxInclusive
    ? inclusiveTax(taxable, input.taxRateBasisPoints, input.rounding)
    : percentOf(taxable, input.taxRateBasisPoints, input.rounding);
  const totalMinor = input.taxInclusive ? taxable : taxable + taxMinor;
  return { extendedMinor, discountMinor: input.discountMinor, taxMinor, totalMinor };
}
