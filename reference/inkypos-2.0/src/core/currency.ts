/**
 * InkyPOS 2.0 — Currency Utilities
 * Handles dual-currency transactions (USD base + Zimbabwean Gold ZiG)
 */

import { CurrencyCode, PaymentRecord } from './types.ts';

export const DEFAULT_ZIG_RATE = 25.40; // 1 USD = 25.40 ZiG

export function roundToDecimals(val: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

export function usdToZig(amountUSD: number, rate: number = DEFAULT_ZIG_RATE): number {
  return roundToDecimals(amountUSD * rate, 2);
}

export function zigToUsd(amountZIG: number, rate: number = DEFAULT_ZIG_RATE): number {
  if (rate <= 0) return 0;
  return roundToDecimals(amountZIG / rate, 2);
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'USD'): string {
  if (currency === 'ZIG') {
    return `ZiG ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface SplitPaymentSummary {
  totalDueUSD: number;
  totalPaidUSD: number;
  remainingUSD: number;
  changeDueUSD: number;
  changeDueZIG: number;
  isFullyPaid: boolean;
}

export function calculateSplitPaymentSummary(
  totalDueUSD: number,
  payments: PaymentRecord[],
  exchangeRate: number = DEFAULT_ZIG_RATE
): SplitPaymentSummary {
  const totalPaidUSD = roundToDecimals(
    payments.reduce((acc, p) => acc + p.amountInUSD, 0),
    2
  );

  const diffUSD = roundToDecimals(totalPaidUSD - totalDueUSD, 2);

  if (diffUSD >= 0) {
    return {
      totalDueUSD: roundToDecimals(totalDueUSD, 2),
      totalPaidUSD,
      remainingUSD: 0,
      changeDueUSD: diffUSD,
      changeDueZIG: usdToZig(diffUSD, exchangeRate),
      isFullyPaid: true,
    };
  } else {
    return {
      totalDueUSD: roundToDecimals(totalDueUSD, 2),
      totalPaidUSD,
      remainingUSD: roundToDecimals(Math.abs(diffUSD), 2),
      changeDueUSD: 0,
      changeDueZIG: 0,
      isFullyPaid: false,
    };
  }
}
