import { z } from 'zod';
import { roleSchema } from '../auth/contracts';
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
  /** Absent from servers older than OG-1. */
  category_id: id.nullable().optional(),
  version: z.int().positive(),
});

export const categoryDataSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  position: z.int().min(0),
  active: z.boolean(),
  version: z.int().positive(),
});
export type CategoryInfo = z.infer<typeof categoryDataSchema>;

/** What a till keeps about a customer: enough to find them and name them on a receipt. */
export const customerDataSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  phone: z.string().max(32).nullable(),
  active: z.boolean(),
  version: z.int().positive(),
});
export type CustomerInfo = z.infer<typeof customerDataSchema>;

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

/**
 * Someone who can sign in on the till, keyed by user id. Sent to tills only.
 * `pin` is null until a manager sets one (App\Staff\StaffPin on the server).
 */
export const staffPinHashSchema = z.object({
  algorithm: z.literal('pbkdf2-sha256'),
  // Bounded so a bad value cannot hang the till; mirrors StaffPin::MIN/MAX_ITERATIONS.
  iterations: z.int().min(10_000).max(1_000_000),
  salt: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  hash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type StaffPinHash = z.infer<typeof staffPinHashSchema>;

export const staffDataSchema = z.object({
  id,
  name: z.string().min(1).max(255),
  role: roleSchema,
  active: z.boolean(),
  pin: staffPinHashSchema.nullable(),
  version: z.int().positive(),
});
export type StaffInfo = z.infer<typeof staffDataSchema>;

export const ENTITY_DATA_SCHEMAS = {
  staff: staffDataSchema,
  business: businessDataSchema,
  branch: branchDataSchema,
  register: registerDataSchema,
  product: productDataSchema,
  payment_method: paymentMethodDataSchema,
  exchange_rate: exchangeRateDataSchema,
  category: categoryDataSchema,
  customer: customerDataSchema,
} as const;
