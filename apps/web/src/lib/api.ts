import { ApiError, createApiClient, uuidv7, type ApiClient } from '@inkypos/core';

/** The InkyPOS API. Set VITE_API_URL when hosting; locally it is the API on port 8000 of the same machine. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8000`;

export interface ClientAuth {
  token: () => Promise<string | null>;
  tenantId?: () => string | null;
}

export function makeClient(auth?: ClientAuth): ApiClient {
  return createApiClient({
    baseUrl: API_URL,
    fetch: (input, init) => window.fetch(input, init),
    generateId: () => uuidv7(),
    clientVersion: 'web/0.1.0',
    getAccessToken: auth?.token,
    tenantId: auth?.tenantId,
  });
}

/** A message a person can act on, for any error the API client throws. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'network_error':
      case 'timeout':
        return 'Cannot reach the InkyPOS server. Check your connection and try again.';
      case 'unauthenticated':
        return e.message.includes('Invalid email') ? 'Email or password is incorrect.' : 'Your session has ended. Please sign in again.';
      case 'rate_limited':
        return 'Too many attempts. Wait a minute and try again.';
      case 'business_pending':
        return 'This business is waiting for Inkgenius Technologies to activate it.';
      case 'password_change_required':
        return 'Choose a new password to replace the temporary one.';
      case 'two_factor_setup_required':
        return 'Set up your authenticator app first.';
      case 'validation_failed': {
        const first = e.details ? Object.values(e.details)[0]?.[0] : undefined;
        return first ?? e.message;
      }
      case 'forbidden':
        return e.message && e.message !== 'This action is not allowed.' ? e.message : 'You do not have permission to do that.';
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

/** Money in minor units for display, e.g. 1234 USD → "USD 12.34". */
export function money(minor: number, currency = 'USD'): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${currency} ${sign}${Math.floor(abs / 100).toLocaleString()}.${String(abs % 100).padStart(2, '0')}`;
}

/** "12.34" → 1234; null when it is not an amount. */
export function parseMoney(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, cents = ''] = t.split('.');
  return Number(whole) * 100 + Number(cents.padEnd(2, '0'));
}

/** 12500 thousandths → "12.5"; units other than items get their unit. */
export function qty(milli: number, unit = 'each'): string {
  const text = milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, '');
  return unit === 'each' ? text : `${text} ${unit}`;
}

/** "2.5" → 2500 thousandths; "0" is allowed (a stock count of nothing); null when not a quantity. */
export function parseQty(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  return Math.round(Number(t) * 1000);
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
