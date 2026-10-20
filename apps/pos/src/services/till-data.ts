import {
  buildReceipt,
  completeCart,
  type Cart,
  type CurrencyCode,
  type ExchangeRateInfo,
  type LocalStore,
  type LocalSyncState,
  type ReceiptDocument,
} from '@inkypos/core';
import type { DeviceRecord } from './device-session';
import { newId } from './api';

/**
 * Everything checkout needs, read from the local database so the till works
 * offline. Returns null until the first catalogue pull has brought the
 * business details down.
 */
export async function loadCheckoutData(store: LocalStore) {
  const business = await store.reference.business();
  if (!business) return null;
  const paymentMethods = await store.reference.paymentMethods();
  const rates = new Map<CurrencyCode, ExchangeRateInfo>();
  for (const currency of new Set(paymentMethods.flatMap((m) => m.currencies))) {
    if (currency === business.base_currency) continue;
    const rate = await store.reference.exchangeRate(business.base_currency, currency);
    if (rate) rates.set(currency, rate);
  }
  return { business, paymentMethods, rates };
}

/** Commits a sale with a receipt number of the form <register code>-<6-digit device sequence>. */
export async function completeSale(store: LocalStore, device: DeviceRecord, cart: Cart): Promise<string> {
  const event = completeCart(cart, {
    newId,
    tenantId: device.tenant_id,
    branchId: device.branch_id,
    registerId: device.register_id,
    deviceId: device.device_id,
    // Until staff sign-in exists, sales are attributed to the device.
    actorId: device.device_id,
    catalogueVersion: await store.reference.catalogueVersion(),
    now: () => new Date(),
  });
  const code = (await store.reference.register(device.register_id))?.code ?? 'R';
  await store.sales.commitSale(event, { receiptNumber: (seq) => `${code}-${String(seq).padStart(6, '0')}` });
  return event.payload.sale_id;
}

export async function loadReceipt(store: LocalStore, device: DeviceRecord, saleId: string): Promise<{ receipt: ReceiptDocument; syncState: LocalSyncState } | null> {
  const sale = await store.sales.get(saleId);
  if (!sale) return null;
  const [business, branch, register, methods] = await Promise.all([
    store.reference.business(),
    store.reference.branch(device.branch_id),
    store.reference.register(device.register_id),
    store.reference.paymentMethods(),
  ]);
  const width = Number((await store.settings.get('receipt_width')) ?? 42) as ReceiptDocument['widthChars'];
  return {
    receipt: buildReceipt(sale.sale, {
      business,
      branch,
      register,
      methods,
      formatDateTime: (iso) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
    }, [32, 42, 48].includes(width) ? width : 42),
    syncState: sale.sync_state,
  };
}
