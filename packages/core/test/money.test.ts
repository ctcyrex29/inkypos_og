import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  divRound,
  extendPrice,
  formatMajor,
  inclusiveTax,
  money,
  MoneyError,
  parseMajor,
  percentOf,
  priceLine,
  subtract,
} from '../src';

describe('money', () => {
  it('rejects non-integer minor amounts', () => {
    expect(() => money(10.5, 'USD')).toThrow(MoneyError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'USD')).toThrow(MoneyError);
  });

  it('refuses to mix currencies', () => {
    expect(() => add(money(1, 'USD'), money(1, 'ZWG'))).toThrow(/Currency mismatch/);
    expect(subtract(money(500, 'ZWG'), money(125, 'ZWG'))).toEqual({ amount: 375, currency: 'ZWG' });
  });

  it('parses and formats decimals without floating point error', () => {
    expect(parseMajor('0.1', 'USD').amount).toBe(10);
    expect(parseMajor('19.99', 'USD').amount).toBe(1999);
    expect(parseMajor('-3.05', 'USD').amount).toBe(-305);
    expect(() => parseMajor('1.005', 'USD')).toThrow(/at most 2 decimal/);
    expect(() => parseMajor('1e3', 'USD')).toThrow(/Not a decimal/);
    expect(formatMajor(money(5, 'USD'))).toBe('0.05');
    expect(formatMajor(money(-123456, 'ZWG'))).toBe('-1234.56');
  });
});

describe('rounding', () => {
  it('rounds half away from zero, symmetrically for negatives', () => {
    expect(divRound(5, 2, 'half_away_from_zero')).toBe(3);
    expect(divRound(-5, 2, 'half_away_from_zero')).toBe(-3);
    expect(divRound(4, 3, 'half_away_from_zero')).toBe(1);
  });

  it('rounds half to even', () => {
    expect(divRound(5, 2, 'half_even')).toBe(2);
    expect(divRound(7, 2, 'half_even')).toBe(4);
    expect(divRound(-5, 2, 'half_even')).toBe(-2);
  });

  it('stays exact near the safe integer limit', () => {
    const n = 9_007_199_254_740_000;
    expect(divRound(n, 1000, 'half_even')).toBe(9_007_199_254_740);
  });

  it('extends prices by milli-quantities', () => {
    expect(extendPrice(1999, 3000, 'half_away_from_zero')).toBe(5997); // 3 x 19.99
    expect(extendPrice(450, 1250, 'half_away_from_zero')).toBe(563); // 1.25 kg x 4.50 = 5.625
    expect(extendPrice(450, 1250, 'half_even')).toBe(562);
  });

  it('computes exclusive and inclusive tax', () => {
    expect(percentOf(10_000, 1500, 'half_away_from_zero')).toBe(1500);
    expect(inclusiveTax(11_500, 1500, 'half_away_from_zero')).toBe(1500);
    expect(inclusiveTax(999, 1500, 'half_away_from_zero')).toBe(130); // net 868.70 -> 869
  });
});

describe('allocate', () => {
  it('always sums back to the total', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(1000, [5997, 563, 0])).toEqual([914, 86, 0]);
    for (let total = 0; total < 300; total += 7) {
      expect(allocate(total, [3, 7, 11, 13]).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('rejects unusable weights', () => {
    expect(() => allocate(10, [])).toThrow(MoneyError);
    expect(() => allocate(10, [0, 0])).toThrow(MoneyError);
    expect(() => allocate(10, [1, -1])).toThrow(MoneyError);
  });
});

describe('priceLine', () => {
  it('prices a tax-exclusive line with a discount', () => {
    expect(
      priceLine({
        unitPriceMinor: 1000,
        quantityMilli: 2000,
        discountMinor: 200,
        taxRateBasisPoints: 1500,
        taxInclusive: false,
        rounding: 'half_away_from_zero',
      }),
    ).toEqual({ extendedMinor: 2000, discountMinor: 200, taxMinor: 270, totalMinor: 2070 });
  });

  it('prices a tax-inclusive line', () => {
    expect(
      priceLine({
        unitPriceMinor: 1150,
        quantityMilli: 1000,
        discountMinor: 0,
        taxRateBasisPoints: 1500,
        taxInclusive: true,
        rounding: 'half_away_from_zero',
      }),
    ).toEqual({ extendedMinor: 1150, discountMinor: 0, taxMinor: 150, totalMinor: 1150 });
  });

  it('rejects a discount larger than the line', () => {
    expect(() =>
      priceLine({
        unitPriceMinor: 100,
        quantityMilli: 1000,
        discountMinor: 101,
        taxRateBasisPoints: 0,
        taxInclusive: true,
        rounding: 'half_even',
      }),
    ).toThrow(MoneyError);
  });
});
