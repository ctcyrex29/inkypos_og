import type { UnsequencedSaleEvent } from '../storage/ports';
import { priceLine } from './pricing';

export interface SampleSaleContext {
  newId: () => string;
  tenantId: string;
  branchId: string;
  registerId: string;
  deviceId: string;
  /** Cashier; until staff sign-in exists (Phase 5) callers pass the device id. */
  actorId: string;
  completedAt?: string;
}

const SAMPLE_ITEMS = [
  { sku: 'SAMPLE-BREAD', name: 'Sample bread 700g', unit: 120, qty: 2000, tax: { code: 'VAT15', bp: 1500 } },
  { sku: 'SAMPLE-MILK', name: 'Sample milk 1L', unit: 95, qty: 1000, tax: { code: 'ZERO', bp: 0 } },
  { sku: 'SAMPLE-RICE', name: 'Sample rice per kg', unit: 180, qty: 1250, tax: { code: 'VAT15', bp: 1500 } },
] as const;

/**
 * A valid cash sale built with the shared pricing rule. Used by tests and by
 * the developer-only "record sample sale" action; never by real checkout.
 * Product ids are derived per call, so sample stock never touches real products.
 */
export function buildSampleSale(ctx: SampleSaleContext, itemCount = 2): UnsequencedSaleEvent {
  const saleId = ctx.newId();
  const completedAt = ctx.completedAt ?? new Date().toISOString();
  const items = SAMPLE_ITEMS.slice(0, Math.max(1, Math.min(itemCount, SAMPLE_ITEMS.length)));

  const lines = items.map((item) => {
    const p = priceLine({
      unitPriceMinor: item.unit,
      quantityMilli: item.qty,
      discountMinor: 0,
      taxRateBasisPoints: item.tax.bp,
      taxInclusive: true,
      rounding: 'half_away_from_zero',
    });
    return {
      line: {
        line_id: ctx.newId(),
        product_id: ctx.newId(),
        sku: item.sku,
        name: item.name,
        quantity_milli: item.qty,
        unit_price_minor: item.unit,
        discount_minor: 0,
        tax: { code: item.tax.code, rate_bp: item.tax.bp, inclusive: true, amount_minor: p.taxMinor },
        line_total_minor: p.totalMinor,
      },
      priced: p,
    };
  });

  const total = lines.reduce((s, l) => s + l.priced.totalMinor, 0);
  const tendered = Math.ceil(total / 100) * 100 + 100;

  return {
    schema_version: 1,
    event_id: ctx.newId(),
    event_type: 'sale.completed',
    occurred_at: completedAt,
    tenant_id: ctx.tenantId,
    branch_id: ctx.branchId,
    register_id: ctx.registerId,
    device_id: ctx.deviceId,
    actor_user_id: ctx.actorId,
    aggregate_id: saleId,
    payload: {
      sale_id: saleId,
      receipt_number: `S-${saleId.slice(-8).toUpperCase()}`,
      currency: 'USD',
      rounding: 'half_away_from_zero',
      catalogue_version: 0,
      price_list_version: 0,
      completed_at: completedAt,
      lines: lines.map((l) => l.line),
      totals: {
        subtotal_minor: lines.reduce((s, l) => s + l.priced.extendedMinor, 0),
        discount_minor: 0,
        tax_minor: lines.reduce((s, l) => s + l.priced.taxMinor, 0),
        total_minor: total,
      },
      payments: [
        {
          payment_id: ctx.newId(),
          method_code: 'cash',
          status: 'recorded',
          currency: 'USD',
          amount_minor: tendered,
          sale_currency_amount_minor: tendered,
        },
      ],
      change_minor: tendered - total,
      stock_movements: lines.map((l) => ({
        movement_id: ctx.newId(),
        product_id: l.line.product_id,
        quantity_delta_milli: -l.line.quantity_milli,
      })),
    },
  };
}
