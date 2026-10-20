<?php

namespace App\Sales;

/**
 * Port of packages/core/src/sales/refund.ts (cumulativeRefund). After `q` of
 * a line sold in quantity `Q` for total `T` has come back, exactly
 * round(T × q / Q) has been refunded in total; a full return refunds T.
 * Verified against packages/core/test-vectors/refund-events.v1.json.
 */
final class Refunds
{
    public static function cumulative(int $lineTotalMinor, int $lineQuantityMilli, int $refundedMilli, string $rounding): int
    {
        if ($refundedMilli >= $lineQuantityMilli) {
            return $lineTotalMinor;
        }

        return Pricing::divRound($lineTotalMinor * $refundedMilli, $lineQuantityMilli, $rounding);
    }

    /** What this refund line must pay, given what was refunded on the line before it. */
    public static function due(int $lineTotalMinor, int $lineQuantityMilli, int $previouslyRefundedMilli, int $quantityMilli, string $rounding): int
    {
        return self::cumulative($lineTotalMinor, $lineQuantityMilli, $previouslyRefundedMilli + $quantityMilli, $rounding)
            - self::cumulative($lineTotalMinor, $lineQuantityMilli, $previouslyRefundedMilli, $rounding);
    }
}
