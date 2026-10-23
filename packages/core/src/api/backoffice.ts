import { z } from 'zod';
import { customerDataSchema, productDataSchema, unitSchema, type OptionGroup } from '../catalogue/contracts';
import { currencySchema } from '../sync/events';

/**
 * Back-office payloads (managers, online). Mirrors the OG-1 controllers in
 * apps/api/app/Http/Controllers/Api/V1. Tills never receive these.
 */

const id = z.uuid();
const minor = z.int().min(0);
const milli = z.int();

/** A product as the back office sees it: the till payload plus cost and reorder level. */
export const backOfficeProductSchema = productDataSchema.extend({
  cost_minor: minor.nullable().optional(),
  reorder_level_milli: milli.nullable().optional(),
  /** False for dishes made to order: not counted as stock (their recipe ingredients are). */
  track_stock: z.boolean().optional(),
});
export type BackOfficeProduct = z.infer<typeof backOfficeProductSchema>;

export interface ProductInput {
  sku: string;
  name: string;
  unit_price_minor: number;
  unit?: z.infer<typeof unitSchema>;
  tax_code: string;
  tax_rate_bp: number;
  tax_inclusive?: boolean;
  active?: boolean;
  barcodes?: string[];
  category_id?: string | null;
  cost_minor?: number | null;
  reorder_level_milli?: number | null;
  track_stock?: boolean;
  /** Ids may be left out for new groups and options; the server assigns them. */
  option_groups?: OptionGroupInput[];
}

export type OptionGroupInput = Omit<OptionGroup, 'id' | 'options'> & { id?: string; options: (Omit<OptionGroup['options'][number], 'id'> & { id?: string })[] };

export const recipeSchema = z.object({
  product_id: id,
  items: z.array(
    z.object({ option_id: id.nullable(), ingredient_id: id, ingredient_name: z.string(), unit: unitSchema, quantity_milli: z.int().positive() }),
  ),
});
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeItemInput = { option_id: string | null; ingredient_id: string; quantity_milli: number };

export const businessSettingsSchema = z.object({
  id,
  name: z.string(),
  timezone: z.string(),
  business_type: z.enum(['retail', 'restaurant']),
});
export type BusinessSettings = z.infer<typeof businessSettingsSchema>;

/** A person in the business as the back office sees them (GET /staff). PIN hashes never come here. */
export const staffMemberSchema = z.object({
  id,
  name: z.string(),
  email: z.string().nullable(),
  /** Works the tills only: no email or password, so never signs in to the back office. */
  till_only: z.boolean(),
  role: z.enum(['owner', 'manager', 'cashier']),
  active: z.boolean(),
  has_pin: z.boolean(),
  pin_set_at: z.string().nullable(),
  version: z.int().positive(),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;
export interface TillStaffInput {
  name: string;
  /** Cashier unless given; only an owner may add a manager. */
  role?: 'cashier' | 'manager';
  pin?: string;
}

export interface CategoryInput {
  name: string;
  position?: number;
  active?: boolean;
}

export const backOfficeCustomerSchema = customerDataSchema.extend({
  email: z.string().nullable(),
  notes: z.string().nullable(),
});
export type BackOfficeCustomer = z.infer<typeof backOfficeCustomerSchema>;

export const customerHistorySchema = backOfficeCustomerSchema.extend({
  sales_count: z.int().min(0),
  sales_total_minor: z.int(),
  recent_sales: z.array(
    z.object({ sale_id: id, receipt_number: z.string(), completed_at: z.string(), currency: currencySchema, total_minor: z.int() }),
  ),
});
export type CustomerHistory = z.infer<typeof customerHistorySchema>;

export interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  active?: boolean;
}

export const supplierSchema = z.object({
  id,
  name: z.string(),
  contact_person: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  active: z.boolean(),
});
export type Supplier = z.infer<typeof supplierSchema>;
export type SupplierInput = Partial<Omit<Supplier, 'id'>> & { name: string };

export const stockLevelsSchema = z.object({
  items: z.array(
    z.object({
      product_id: id,
      sku: z.string(),
      name: z.string(),
      unit: unitSchema,
      active: z.boolean(),
      on_hand_milli: milli,
      reorder_level_milli: milli.nullable(),
      low: z.boolean(),
      cost_minor: minor.nullable(),
      value_minor: minor.nullable(),
    }),
  ),
  total_value_minor: z.int(),
  currency: currencySchema,
});
export type StockLevels = z.infer<typeof stockLevelsSchema>;
export type StockLevel = StockLevels['items'][number];

export const STOCK_ADJUSTMENT_REASONS = ['intake', 'damage', 'correction', 'count'] as const;
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

/** intake adds, damage removes, correction is either sign; count records what was counted. */
export type StockAdjustmentInput = { branch_id: string; product_id: string; note?: string } & (
  | { reason: 'intake' | 'damage' | 'correction'; quantity_delta_milli: number }
  | { reason: 'count'; counted_milli: number }
);

export const stockAdjustmentResultSchema = z.object({
  id,
  product_id: id,
  branch_id: id,
  reason: z.string(),
  quantity_delta_milli: milli,
  on_hand_milli: milli,
});

export const stockLedgerEntrySchema = z.object({
  id,
  branch_id: id,
  quantity_delta_milli: milli,
  reason: z.string(),
  sale_id: id.nullable(),
  purchase_id: id.nullable(),
  note: z.string().nullable(),
  occurred_at: z.string(),
});
export type StockLedgerEntry = z.infer<typeof stockLedgerEntrySchema>;

export const purchaseSchema = z.object({
  id,
  branch_id: id,
  supplier_id: id,
  supplier_name: z.string().nullable(),
  reference: z.string().nullable(),
  received_at: z.string(),
  total_cost_minor: z.int(),
  notes: z.string().nullable(),
  lines: z
    .array(z.object({ product_id: id, name: z.string(), quantity_milli: milli, unit_cost_minor: minor, line_cost_minor: minor }))
    .optional(),
});
export type Purchase = z.infer<typeof purchaseSchema>;

export interface PurchaseInput {
  branch_id: string;
  supplier_id: string;
  reference?: string;
  received_at?: string;
  notes?: string;
  lines: { product_id: string; quantity_milli: number; unit_cost_minor: number }[];
}

/** Cost of a purchase line: thousandths × unit cost, rounded half up to a whole minor unit (as the server does). */
export function purchaseLineCost(quantityMilli: number, unitCostMinor: number): number {
  return Math.floor((quantityMilli * unitCostMinor + 500) / 1000);
}
