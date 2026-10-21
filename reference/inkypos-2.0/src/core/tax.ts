/**
 * InkyPOS 2.0 — Tax Calculations
 * Handles VAT rates, exemptions, and line-item tax apportionment
 */

import { Product, TaxBreakdown, TaxCategory } from './types.ts';
import { roundToDecimals } from './currency.ts';

export const DEFAULT_TAX_CATEGORIES: TaxCategory[] = [
  { id: 'tax-vat-std', name: 'Standard VAT (15%)', rate: 0.15, isExempt: false },
  { id: 'tax-vat-zero', name: 'Zero-Rated (0%)', rate: 0.0, isExempt: false },
  { id: 'tax-vat-exempt', name: 'Exempt', rate: 0.0, isExempt: true },
];

export function calculateItemTax(
  priceUSD: number,
  quantity: number,
  taxCategory: TaxCategory,
  priceIncludesTax: boolean = true
): {
  taxableAmountUSD: number;
  taxAmountUSD: number;
  totalUSD: number;
} {
  const lineGrossUSD = roundToDecimals(priceUSD * quantity, 2);

  if (taxCategory.isExempt || taxCategory.rate === 0) {
    return {
      taxableAmountUSD: lineGrossUSD,
      taxAmountUSD: 0,
      totalUSD: lineGrossUSD,
    };
  }

  if (priceIncludesTax) {
    // Gross includes VAT: Tax = Gross - (Gross / (1 + Rate))
    const netUSD = roundToDecimals(lineGrossUSD / (1 + taxCategory.rate), 2);
    const taxUSD = roundToDecimals(lineGrossUSD - netUSD, 2);
    return {
      taxableAmountUSD: netUSD,
      taxAmountUSD: taxUSD,
      totalUSD: lineGrossUSD,
    };
  } else {
    // Net excludes VAT: Tax = Net * Rate
    const taxUSD = roundToDecimals(lineGrossUSD * taxCategory.rate, 2);
    return {
      taxableAmountUSD: lineGrossUSD,
      taxAmountUSD: taxUSD,
      totalUSD: roundToDecimals(lineGrossUSD + taxUSD, 2),
    };
  }
}

export function computeTaxesBreakdown(
  items: Array<{ product: Product; quantity: number; discountUSD: number }>,
  taxCategories: TaxCategory[] = DEFAULT_TAX_CATEGORIES
): TaxBreakdown[] {
  const categoryMap = new Map(taxCategories.map((c) => [c.id, c]));
  const breakdownMap = new Map<string, TaxBreakdown>();

  for (const item of items) {
    const taxCategory =
      categoryMap.get(item.product.taxCategoryId) ||
      taxCategories[0]; // fallback to standard

    const lineTotal = roundToDecimals(
      item.product.priceUSD * item.quantity - (item.discountUSD || 0),
      2
    );

    const calc = calculateItemTax(
      lineTotal / (item.quantity || 1),
      item.quantity,
      taxCategory,
      true
    );

    const existing = breakdownMap.get(taxCategory.id) || {
      taxCategoryId: taxCategory.id,
      taxCategoryName: taxCategory.name,
      rate: taxCategory.rate,
      taxableAmountUSD: 0,
      taxAmountUSD: 0,
    };

    existing.taxableAmountUSD = roundToDecimals(
      existing.taxableAmountUSD + calc.taxableAmountUSD,
      2
    );
    existing.taxAmountUSD = roundToDecimals(
      existing.taxAmountUSD + calc.taxAmountUSD,
      2
    );

    breakdownMap.set(taxCategory.id, existing);
  }

  return Array.from(breakdownMap.values());
}
