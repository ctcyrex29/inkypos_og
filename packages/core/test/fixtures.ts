import { priceLine, uuidv7, type SyncEvent } from '../src';

type SaleEvent = Extract<SyncEvent, { event_type: 'sale.completed' }>;

export const ids = {
  tenant: uuidv7(),
  branch: uuidv7(),
  register: uuidv7(),
  device: uuidv7(),
  user: uuidv7(),
  bread: uuidv7(),
  milk: uuidv7(),
};

/** A valid two-line USD sale paid in cash, with change. */
export function saleEvent(sequence = 1): SaleEvent {
  const saleId = uuidv7();
  const breadPricing = priceLine({
    unitPriceMinor: 120,
    quantityMilli: 2000,
    discountMinor: 0,
    taxRateBasisPoints: 1500,
    taxInclusive: true,
    rounding: 'half_away_from_zero',
  });
  const milkPricing = priceLine({
    unitPriceMinor: 95,
    quantityMilli: 1000,
    discountMinor: 5,
    taxRateBasisPoints: 0,
    taxInclusive: true,
    rounding: 'half_away_from_zero',
  });
  const total = breadPricing.totalMinor + milkPricing.totalMinor; // 240 + 90 = 330

  return {
    schema_version: 1,
    event_id: uuidv7(),
    event_type: 'sale.completed',
    device_sequence: sequence,
    occurred_at: '2026-10-20T09:15:00+02:00',
    tenant_id: ids.tenant,
    branch_id: ids.branch,
    register_id: ids.register,
    device_id: ids.device,
    actor_user_id: ids.user,
    aggregate_id: saleId,
    payload: {
      sale_id: saleId,
      receipt_number: `R01-${String(sequence).padStart(6, '0')}`,
      currency: 'USD',
      rounding: 'half_away_from_zero',
      catalogue_version: 12,
      price_list_version: 4,
      completed_at: '2026-10-20T09:15:00+02:00',
      lines: [
        {
          line_id: uuidv7(),
          product_id: ids.bread,
          sku: 'BRD-001',
          name: 'White bread 700g',
          quantity_milli: 2000,
          unit_price_minor: 120,
          discount_minor: 0,
          tax: { code: 'VAT15', rate_bp: 1500, inclusive: true, amount_minor: breadPricing.taxMinor },
          line_total_minor: breadPricing.totalMinor,
        },
        {
          line_id: uuidv7(),
          product_id: ids.milk,
          sku: 'MLK-001',
          name: 'Milk 1L',
          quantity_milli: 1000,
          unit_price_minor: 95,
          discount_minor: 5,
          tax: { code: 'ZERO', rate_bp: 0, inclusive: true, amount_minor: 0 },
          line_total_minor: milkPricing.totalMinor,
        },
      ],
      totals: {
        subtotal_minor: breadPricing.extendedMinor + milkPricing.extendedMinor,
        discount_minor: 5,
        tax_minor: breadPricing.taxMinor,
        total_minor: total,
      },
      payments: [
        {
          payment_id: uuidv7(),
          method_code: 'cash',
          status: 'recorded',
          currency: 'USD',
          amount_minor: 500,
          sale_currency_amount_minor: 500,
        },
      ],
      change_minor: 500 - total,
      stock_movements: [
        { movement_id: uuidv7(), product_id: ids.bread, quantity_delta_milli: -2000 },
        { movement_id: uuidv7(), product_id: ids.milk, quantity_delta_milli: -1000 },
      ],
    },
  };
}
