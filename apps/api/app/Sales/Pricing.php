<?php

namespace App\Sales;

use InvalidArgumentException;

/**
 * PHP port of packages/core/src/money/money.ts and sales/pricing.ts.
 * Integer minor units only. Verified against packages/core/test-vectors/pricing.v1.json.
 */
final class Pricing
{
    public const MODES = ['half_away_from_zero', 'half_even'];

    public static function divRound(int $numerator, int $denominator, string $mode): int
    {
        if ($denominator <= 0) {
            throw new InvalidArgumentException('denominator must be positive');
        }
        if (! in_array($mode, self::MODES, true)) {
            throw new InvalidArgumentException("Unknown rounding mode {$mode}");
        }
        $sign = $numerator < 0 ? -1 : 1;
        $n = abs($numerator);
        $q = intdiv($n, $denominator);
        $twiceRemainder = ($n - $q * $denominator) * 2;
        if ($twiceRemainder > $denominator) {
            $q++;
        } elseif ($twiceRemainder === $denominator && ($mode === 'half_away_from_zero' || $q % 2 !== 0)) {
            $q++;
        }

        return $q === 0 ? 0 : $sign * $q;
    }

    private static function product(int $a, int $b): int
    {
        $p = $a * $b;
        if (! is_int($p) || abs($p) > 9007199254740991) { // stay within the client's safe-integer range
            throw new InvalidArgumentException("Overflow multiplying {$a} by {$b}");
        }

        return $p;
    }

    public static function extendPrice(int $unitPriceMinor, int $quantityMilli, string $mode): int
    {
        return self::divRound(self::product($unitPriceMinor, $quantityMilli), 1000, $mode);
    }

    public static function percentOf(int $amountMinor, int $basisPoints, string $mode): int
    {
        return self::divRound(self::product($amountMinor, $basisPoints), 10_000, $mode);
    }

    public static function inclusiveTax(int $grossMinor, int $rateBasisPoints, string $mode): int
    {
        return $grossMinor - self::divRound(self::product($grossMinor, 10_000), 10_000 + $rateBasisPoints, $mode);
    }

    /**
     * @return array{extendedMinor: int, discountMinor: int, taxMinor: int, totalMinor: int}
     */
    public static function priceLine(int $unitPriceMinor, int $quantityMilli, int $discountMinor, int $taxRateBasisPoints, bool $taxInclusive, string $rounding): array
    {
        $extended = self::extendPrice($unitPriceMinor, $quantityMilli, $rounding);
        if ($discountMinor < 0 || $discountMinor > $extended) {
            throw new InvalidArgumentException('Line discount must be between zero and the extended price');
        }
        $taxable = $extended - $discountMinor;
        $tax = $taxInclusive
            ? self::inclusiveTax($taxable, $taxRateBasisPoints, $rounding)
            : self::percentOf($taxable, $taxRateBasisPoints, $rounding);

        return [
            'extendedMinor' => $extended,
            'discountMinor' => $discountMinor,
            'taxMinor' => $tax,
            'totalMinor' => $taxInclusive ? $taxable : $taxable + $tax,
        ];
    }
}
