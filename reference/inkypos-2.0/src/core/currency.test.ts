/**
 * InkyPOS 2.0 — Currency & Split Payment Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSplitPaymentSummary,
  DEFAULT_ZIG_RATE,
  formatCurrency,
  roundToDecimals,
  usdToZig,
  zigToUsd,
} from './currency.ts';
import { PaymentRecord } from './types.ts';

test('roundToDecimals: rounds numbers accurately to 2 decimals', () => {
  assert.equal(roundToDecimals(10.555), 10.56);
  assert.equal(roundToDecimals(10.554), 10.55);
  assert.equal(roundToDecimals(0), 0);
  assert.equal(roundToDecimals(1.0001), 1.0);
});

test('usdToZig and zigToUsd: accurate dual-currency conversion at 25.40 rate', () => {
  const usd = 10.0;
  const zig = usdToZig(usd, 25.40);
  assert.equal(zig, 254.0);

  const backUsd = zigToUsd(254.0, 25.40);
  assert.equal(backUsd, 10.0);
});

test('formatCurrency: correctly formats USD and ZiG currencies', () => {
  assert.equal(formatCurrency(25.5, 'USD'), '$25.50');
  assert.equal(formatCurrency(500, 'ZIG'), 'ZiG 500.00');
});

test('calculateSplitPaymentSummary: exact single payment', () => {
  const payments: PaymentRecord[] = [
    {
      id: 'p1',
      paymentMethod: 'CASH_USD',
      currency: 'USD',
      amount: 20.0,
      amountInUSD: 20.0,
      exchangeRate: DEFAULT_ZIG_RATE,
      status: 'SETTLED_OFFLINE',
      tenderedAt: new Date().toISOString(),
    },
  ];

  const summary = calculateSplitPaymentSummary(20.0, payments, DEFAULT_ZIG_RATE);
  assert.equal(summary.isFullyPaid, true);
  assert.equal(summary.totalPaidUSD, 20.0);
  assert.equal(summary.remainingUSD, 0);
  assert.equal(summary.changeDueUSD, 0);
});

test('calculateSplitPaymentSummary: multi-tender split (Cash USD + EcoCash + Cash ZiG) with change', () => {
  const payments: PaymentRecord[] = [
    {
      id: 'p1',
      paymentMethod: 'CASH_USD',
      currency: 'USD',
      amount: 10.0,
      amountInUSD: 10.0,
      exchangeRate: 25.4,
      status: 'SETTLED_OFFLINE',
      tenderedAt: new Date().toISOString(),
    },
    {
      id: 'p2',
      paymentMethod: 'ECOCASH',
      currency: 'USD',
      amount: 15.0,
      amountInUSD: 15.0,
      exchangeRate: 25.4,
      status: 'SETTLED_OFFLINE',
      tenderedAt: new Date().toISOString(),
    },
    {
      id: 'p3',
      paymentMethod: 'CASH_ZIG',
      currency: 'ZIG',
      amount: 254.0, // 254 ZiG = $10.00 USD
      amountInUSD: 10.0,
      exchangeRate: 25.4,
      status: 'SETTLED_OFFLINE',
      tenderedAt: new Date().toISOString(),
    },
  ];

  const totalDueUSD = 32.50;
  const summary = calculateSplitPaymentSummary(totalDueUSD, payments, 25.4);

  assert.equal(summary.isFullyPaid, true);
  assert.equal(summary.totalPaidUSD, 35.0); // 10 + 15 + 10 = 35
  assert.equal(summary.remainingUSD, 0);
  assert.equal(summary.changeDueUSD, 2.50);
  assert.equal(summary.changeDueZIG, 63.50); // 2.50 * 25.4 = 63.50
});

test('calculateSplitPaymentSummary: partial underpayment returns remaining balance', () => {
  const payments: PaymentRecord[] = [
    {
      id: 'p1',
      paymentMethod: 'CARD_USD',
      currency: 'USD',
      amount: 15.0,
      amountInUSD: 15.0,
      exchangeRate: 25.4,
      status: 'SETTLED_OFFLINE',
      tenderedAt: new Date().toISOString(),
    },
  ];

  const summary = calculateSplitPaymentSummary(25.0, payments, 25.4);
  assert.equal(summary.isFullyPaid, false);
  assert.equal(summary.totalPaidUSD, 15.0);
  assert.equal(summary.remainingUSD, 10.0);
  assert.equal(summary.changeDueUSD, 0);
});
