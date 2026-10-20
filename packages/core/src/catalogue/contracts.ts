import { z } from 'zod';
import { currencySchema, roundingModeSchema } from '../sync/events';

/**
 * Reference data a till keeps offline, as sent by GET /api/v1/sync/changes.
 * Mirrors apps/api/app/Catalogue/Catalogue.php payload builders.
 */

const id = z.uuid({ version: 'v7' });
const minor = z.int().min(0);

export const unitSchema = z.enum(['each', 'kg', 'l']);
export type Unit = z.infer<typeof unitSchema>;

export const productDataSchema = z.object({
  product_id: id,
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  unit: unitSchema,
  unit_price_minor: minor,
  tax_code: z.string().min(1).max(32),
  tax_rate_bp: z.int().min(0).max(100_000),
  tax_inclusive: z.boolean(),
  active: z.boolean(),
  barcodes: z.array(z.string().min(1).max(64)),
  version: z.int().positive(),
});

export const paymentMethodDataSchema = z.object({
  id,
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(80),
  kind: z.enum(['cash', 'mobile_money', 'card', 'transfer']),
  currencies: z.array(currencySchema).min(1),
  initial_status: z.enum(['recorded', 'pending_confirmation']),
  requires_reference: z.boolean(),
  gives_change: z.boolean(),
  active: z.boolean(),
  position: z.int().min(0),
  version: z.int().positive(),
});
export type PaymentMethodInfo = z.infer<typeof paymentMethodDataSchema>;

/** `rate` = base-currency units per one quote-currency unit, decimal string. */
export const exchangeRateDataSchema = z.object({
  id,
  base_currency: currencySchema,
  quote_currency: currencySchema,
  rate: z.string().regex(/^\d{1,12}(\.\d{1,8})?$/),
  version: z.int().positive(),
  effective_at: z.iso.datetime({ offset: true }),
});
export type ExchangeRateInfo = z.infer<typeof exchangeRateDataSchema>;

export const businessDataSchema = z.object({
  id,
  name: z.string(),
  base_currency: currencySchema,
  rounding: roundingModeSchema,
  tax_rounding: z.literal('per_line'),
});
export type BusinessInfo = z.infer<typeof businessDataSchema>;

export const branchDataSchema = z.object({ id, name: z.string(), code: z.string() });
export const registerDataSchema = z.object({ id, branch_id: id, name: z.string(), code: z.string() });
export type BranchInfo = z.infer<typeof branchDataSchema>;
export type RegisterInfo = z.infer<typeof registerDataSchema>;

export const ENTITY_DATA_SCHEMAS = {
  business: businessDataSchema,
  branch: branchDataSchema,
  register: registerDataSchema,
  product: productDataSchema,
  payment_method: paymentMethodDataSchema,
  exchange_rate: exchangeRateDataSchema,
} as const;
