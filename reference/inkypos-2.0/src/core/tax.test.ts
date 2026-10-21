/**
 * InkyPOS 2.0 — Tax & VAT Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateItemTax, computeTaxesBreakdown, DEFAULT_TAX_CATEGORIES } from './tax.ts';
import { Product } from './types.ts';

test('calculateItemTax: 15% Standard VAT gross inclusive calculation', () => {
  const stdTax = DEFAULT_TAX_CATEGORIES[0]; // 15% rate
  const grossPrice = 11.50;
  const quantity = 1;

  const result = calculateItemTax(grossPrice, quantity, stdTax, true);
  // Net should be 11.50 / 1.15 = 10.00
  // Tax should be 1.50
  assert.equal(result.taxableAmountUSD, 10.00);
  assert.equal(result.taxAmountUSD, 1.50);
  assert.equal(result.totalUSD, 11.50);
});

test('calculateItemTax: Zero-rated items have 0 tax', () => {
  const zeroTax = DEFAULT_TAX_CATEGORIES[1]; // 0% rate
  const result = calculateItemTax(5.00, 2, zeroTax, true);

  assert.equal(result.taxableAmountUSD, 10.00);
  assert.equal(result.taxAmountUSD, 0.00);
  assert.equal(result.totalUSD, 10.00);
});

test('computeTaxesBreakdown: aggregates multiple items by tax category', () => {
  const p1: Product = {
    id: 'p1',
    tenantId: 't1',
    name: 'Sugar 2kg',
    barcode: '111',
    sku: 'SUG-01',
    category: 'Groceries',
    priceUSD: 11.50, // Std 15% -> Net 10.00, Tax 1.50
    taxCategoryId: 'tax-vat-std',
    stockQuantity: 10,
    allowNegativeStock: false,
    active: true,
  };

  const p2: Product = {
    id: 'p2',
    tenantId: 't1',
    name: 'Milk 1L',
    barcode: '222',
    sku: 'MLK-01',
    category: 'Dairy',
    priceUSD: 2.00, // Zero rated
    taxCategoryId: 'tax-vat-zero',
    stockQuantity: 10,
    allowNegativeStock: false,
    active: true,
  };

  const breakdown = computeTaxesBreakdown([
    { product: p1, quantity: 2, discountUSD: 0 }, // Gross 23.00 -> Net 20.00, Tax 3.00
    { product: p2, quantity: 3, discountUSD: 0 }, // Gross 6.00 -> Net 6.00, Tax 0.00
  ]);

  assert.equal(breakdown.length, 2);

  const std = breakdown.find((b) => b.taxCategoryId === 'tax-vat-std');
  assert.ok(std);
  assert.equal(std.taxableAmountUSD, 20.00);
  assert.equal(std.taxAmountUSD, 3.00);

  const zero = breakdown.find((b) => b.taxCategoryId === 'tax-vat-zero');
  assert.ok(zero);
  assert.equal(zero.taxableAmountUSD, 6.00);
  assert.equal(zero.taxAmountUSD, 0.00);
});
