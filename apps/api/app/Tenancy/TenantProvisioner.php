<?php

namespace App\Tenancy;

use App\Audit\Audit;
use App\Auth\Role;
use App\Billing\PlanCatalog;
use App\Catalogue\Catalogue;
use App\Models\Membership;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Creates a business with its first manager, default payment types and a
 * trial subscription. Used by self sign-up (the business then waits for
 * Inkgenius Technologies to activate it) and by Inkgenius staff in the
 * platform portal (active at once).
 */
final class TenantProvisioner
{
    public function __construct(private readonly PlanCatalog $plans) {}

    /**
     * @param  'pending'|'active'  $status
     * @param  'retail'|'restaurant'|'both'  $businessType
     * @return array{tenant: Tenant, manager: User}
     */
    public function create(string $businessName, string $managerName, string $email, string $password, string $status, string $businessType = 'retail', ?string $activatedBy = null): array
    {
        return DB::transaction(function () use ($businessName, $managerName, $email, $password, $status, $businessType, $activatedBy) {
            $manager = User::create(['name' => $managerName, 'email' => strtolower($email), 'password' => $password]);
            $tenant = Tenant::create(['name' => $businessName, 'status' => $status, 'business_type' => $businessType]);
            if ($status === 'active') {
                $tenant->forceFill(['activated_at' => now(), 'activated_by' => $activatedBy])->save();
            }
            Membership::create(['tenant_id' => $tenant->id, 'user_id' => $manager->id, 'role' => Role::Manager]);

            app(TenantContext::class)->run($tenant, function () {
                app(Catalogue::class)->seedDefaults();
                Subscription::create([
                    'plan_id' => $this->plans->trialPlan()->id,
                    'status' => 'trialing',
                    'current_period_ends_at' => now()->addDays((int) config('inkypos.trial.days')),
                ]);
            });

            Audit::record('tenant.created', $tenant, ['status' => $status, 'by_platform' => $activatedBy !== null], tenantId: $tenant->id, actor: $manager);

            return ['tenant' => $tenant, 'manager' => $manager];
        });
    }
}
