import { z } from 'zod';
import { businessTypeSchema, roleSchema, tenantStatusSchema } from '../auth/contracts';

/**
 * Inkgenius Technologies platform portal (apps/api/app/Http/Controllers/Api/V1/Platform).
 * Separate accounts and tokens from business users.
 */

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: true });

export const platformRoleSchema = z.enum(['administrator', 'support', 'technician', 'accounts']);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const platformPermissionSchema = z.enum([
  'businesses.view',
  'businesses.create',
  'businesses.activate',
  'subscriptions.manage',
  'businesses.support',
  'devices.manage',
  'audit.view',
  'platform_users.manage',
]);
export type PlatformPermission = z.infer<typeof platformPermissionSchema>;

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  administrator: 'Administrator',
  support: 'Support',
  technician: 'Technician',
  accounts: 'Accounts Department',
};

export const platformUserSchema = z.object({
  id,
  name: z.string(),
  email: z.string(),
  role: platformRoleSchema,
  role_label: z.string(),
  active: z.boolean(),
  last_login_at: timestamp.nullable(),
  permissions: z.array(platformPermissionSchema),
});
export type PlatformUser = z.infer<typeof platformUserSchema>;

export const platformSessionSchema = z.object({ user: platformUserSchema, access_token: z.string().min(20), access_expires_at: timestamp });
export type PlatformSession = z.infer<typeof platformSessionSchema>;

const subscriptionSummarySchema = z
  .object({ plan: z.string().nullable(), plan_name: z.string().nullable(), status: z.string(), current_period_ends_at: timestamp.nullable() })
  .nullable();

export const businessSummarySchema = z.object({
  id,
  name: z.string(),
  status: tenantStatusSchema,
  status_reason: z.string().nullable(),
  business_type: businessTypeSchema,
  created_at: timestamp.nullable(),
  activated_at: timestamp.nullable(),
  subscription: subscriptionSummarySchema,
  tills: z.number().optional(),
  staff: z.number().optional(),
});
export type BusinessSummary = z.infer<typeof businessSummarySchema>;

export const businessDetailSchema = businessSummarySchema.extend({
  staff: z.array(
    z.object({ id, name: z.string(), email: z.string().nullable(), role: roleSchema, active: z.boolean(), till_only: z.boolean(), has_pin: z.boolean() }),
  ),
  tills: z.array(
    z.object({
      id,
      name: z.string(),
      platform: z.string(),
      registered_at: timestamp,
      last_seen_at: timestamp.nullable(),
      revoked_at: timestamp.nullable(),
    }).loose(),
  ),
  branches: z.number(),
  activity: z.array(z.object({ action: z.string(), actor_type: z.string(), created_at: z.string() })),
});
export type BusinessDetail = z.infer<typeof businessDetailSchema>;

export const planSchema = z.object({ code: z.string(), name: z.string(), limits: z.record(z.string(), z.number()), features: z.unknown() });
export type Plan = z.infer<typeof planSchema>;

export interface NewBusinessInput {
  business_name: string;
  business_type: z.infer<typeof businessTypeSchema>;
  manager_name: string;
  manager_email: string;
}

export interface SubscriptionInput {
  plan?: string;
  status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'suspended';
  current_period_ends_at?: string;
}

export const temporaryPasswordSchema = z.object({ temporary_password: z.string() });
