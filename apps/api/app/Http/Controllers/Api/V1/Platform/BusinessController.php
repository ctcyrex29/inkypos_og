<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Audit\Audit;
use App\Auth\Role;
use App\Billing\PlanCatalog;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Membership;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\EmailInput;
use App\Support\Like;
use App\Tenancy\TenantContext;
use App\Tenancy\TenantProvisioner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Businesses (tenants) as Inkgenius Technologies staff see them: across every
 * business, so tenant-owned reads go through TenantContext::acrossTenants and
 * every change is audited against the business it touched.
 */
class BusinessController extends Controller
{
    private function across(\Closure $fn): mixed
    {
        return app(TenantContext::class)->acrossTenants($fn);
    }

    /** GET /platform/businesses?status=&type=&search= */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::in(Tenant::STATUSES)],
            'type' => ['nullable', Rule::in(Tenant::BUSINESS_TYPES)],
            'search' => ['nullable', 'string', 'max:100'],
        ]);
        $tenants = Tenant::query()
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($data['type'] ?? null, fn ($q, $t) => $q->where('business_type', $t))
            ->when(trim((string) ($data['search'] ?? '')) !== '', fn ($q) => Like::contains($q, 'name', trim($data['search'])))
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END")->orderByDesc('created_at')
            ->limit(500)->get();

        $ids = $tenants->pluck('id');
        $subscriptions = $this->across(fn () => Subscription::with('plan')->whereIn('tenant_id', $ids)->get()->keyBy('tenant_id'));
        $devices = DB::table('devices')->whereIn('tenant_id', $ids)->whereNull('revoked_at')->groupBy('tenant_id')->selectRaw('tenant_id, COUNT(*) AS n')->pluck('n', 'tenant_id');
        $staff = DB::table('memberships')->whereIn('tenant_id', $ids)->whereNull('deactivated_at')->groupBy('tenant_id')->selectRaw('tenant_id, COUNT(*) AS n')->pluck('n', 'tenant_id');

        return ApiResponse::ok($tenants->map(fn (Tenant $t) => [
            ...$this->summary($t, $subscriptions[$t->id] ?? null),
            'tills' => (int) ($devices[$t->id] ?? 0),
            'staff' => (int) ($staff[$t->id] ?? 0),
        ])->values());
    }

    /** GET /platform/businesses/{tenant} */
    public function show(Request $request, string $tenant): JsonResponse
    {
        $t = $this->find($tenant);
        $subscription = $this->across(fn () => Subscription::with('plan')->where('tenant_id', $t->id)->first());
        $staff = Membership::with('user')->where('tenant_id', $t->id)->get()->map(fn (Membership $m) => [
            'id' => $m->user_id,
            'name' => $m->user->name,
            'email' => $m->user->email,
            'role' => $m->role->value,
            'active' => $m->isActive(),
            'till_only' => $m->user->email === null,
            'has_pin' => $m->hasPin(),
        ])->sortBy('name')->values();
        $devices = Device::where('tenant_id', $t->id)->orderByDesc('created_at')->get()->map->toApi()->values();
        $canAudit = $request->user()->allows(\App\Platform\PlatformPermission::ViewAudit);
        $activity = $canAudit ? DB::table('audit_logs')->where('tenant_id', $t->id)->orderByDesc('created_at')->limit(30)
            ->get(['action', 'actor_type', 'created_at'])->map(fn ($r) => (array) $r)->values() : [];

        return ApiResponse::ok([
            ...$this->summary($t, $subscription),
            'staff' => $staff,
            'tills' => $devices,
            'branches' => DB::table('branches')->where('tenant_id', $t->id)->count(),
            'activity' => $activity,
        ]);
    }

    /** POST /platform/businesses — Inkgenius creates a business directly, active at once. */
    public function store(Request $request, TenantProvisioner $provisioner): JsonResponse
    {
        EmailInput::normalise($request, 'manager_email');
        $data = $request->validate([
            'business_name' => ['required', 'string', 'min:2', 'max:120'],
            'business_type' => ['required', Rule::in(Tenant::BUSINESS_TYPES)],
            'manager_name' => ['required', 'string', 'max:120'],
            'manager_email' => ['required', 'email:rfc', 'max:254', 'unique:users,email'],
        ]);
        // The first manager gets a temporary password, shown once here, to pass on securely.
        $password = Str::password(14, symbols: false);
        ['tenant' => $tenant, 'manager' => $manager] = $provisioner->create($data['business_name'], $data['manager_name'], $data['manager_email'], $password, 'active', $data['business_type'], $request->user()->id);
        $manager->forceFill(['password_must_change' => true])->save();
        Audit::record('platform.business_created', $tenant, ['manager_email' => strtolower($data['manager_email'])], tenantId: $tenant->id);

        return ApiResponse::ok(['business' => $this->summary($tenant->refresh(), null), 'temporary_password' => $password], 201);
    }

    /** POST /platform/businesses/{tenant}/activate */
    public function activate(Request $request, string $tenant): JsonResponse
    {
        $t = $this->find($tenant);
        if (! $t->isActive()) {
            DB::transaction(function () use ($t, $request) {
                $t->forceFill(['status' => 'active', 'status_reason' => null, 'activated_at' => $t->activated_at ?? now(), 'activated_by' => $t->activated_by ?? $request->user()->id])->save();
                Audit::record('platform.business_activated', $t, tenantId: $t->id);
            });
        }

        return ApiResponse::ok($this->summary($t, null));
    }

    /** POST /platform/businesses/{tenant}/suspend {reason} — tills keep their sales and sync them, but cannot start new ones. */
    public function suspend(Request $request, string $tenant): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']]);
        $t = $this->find($tenant);
        DB::transaction(function () use ($t, $data) {
            $t->forceFill(['status' => 'suspended', 'status_reason' => $data['reason']])->save();
            Audit::record('platform.business_suspended', $t, ['reason' => $data['reason']], tenantId: $t->id);
        });

        return ApiResponse::ok($this->summary($t, null));
    }

    /** PATCH /platform/businesses/{tenant}/subscription — plan, status and paid-until (Accounts). */
    public function updateSubscription(Request $request, string $tenant, PlanCatalog $plans): JsonResponse
    {
        $data = $request->validate([
            'plan' => ['sometimes', Rule::in(array_keys((array) config('inkypos.plans')))],
            'status' => ['sometimes', Rule::in(['trialing', 'active', 'past_due', 'canceled', 'suspended'])],
            'current_period_ends_at' => ['sometimes', 'date', 'after:today'],
        ]);
        $t = $this->find($tenant);
        $subscription = app(TenantContext::class)->run($t, function () use ($data, $plans, $t) {
            return DB::transaction(function () use ($data, $plans, $t) {
                $s = Subscription::lockForUpdate()->firstOrFail();
                $s->fill([
                    ...(isset($data['plan']) ? ['plan_id' => $plans->get($data['plan'])->id] : []),
                    ...(isset($data['status']) ? ['status' => $data['status']] : []),
                    ...(isset($data['current_period_ends_at']) ? ['current_period_ends_at' => $data['current_period_ends_at']] : []),
                ])->save();
                Audit::record('platform.subscription_updated', $s, $data, tenantId: $t->id);

                return $s->load('plan');
            });
        });

        return ApiResponse::ok($this->summary($t, $subscription));
    }

    /** POST /platform/businesses/{tenant}/staff/{user}/reset-password — a new temporary password for a manager (Support). */
    public function resetManagerPassword(Request $request, string $tenant, string $user): JsonResponse
    {
        $t = $this->find($tenant);
        $membership = Str::isUuid($user) ? Membership::with('user')->where('tenant_id', $t->id)->where('user_id', $user)->first() : null;
        if (! $membership || $membership->role !== Role::Manager || $membership->user->email === null) {
            throw new ApiException('not_found', 'No manager with a login by that id in this business.', 404);
        }
        // Someone with logins in several businesses: only reset it if this is their only one, or support could take over another business's account.
        if (Membership::where('user_id', $membership->user_id)->count() > 1) {
            throw new ApiException('validation_failed', 'This person signs in to more than one business; they must reset their own password.', 422);
        }
        $password = Str::password(14, symbols: false);
        DB::transaction(function () use ($membership, $password, $t) {
            /** @var User $u */
            $u = $membership->user;
            $u->forceFill(['password' => $password, 'password_must_change' => true])->save();
            $u->tokens()->delete();
            DB::table('refresh_tokens')->where('user_id', $u->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);
            Audit::record('platform.manager_password_reset', $membership, ['user_id' => $u->id], tenantId: $t->id);
        });

        return ApiResponse::ok(['temporary_password' => $password]);
    }

    /** POST /platform/businesses/{tenant}/tills/{device}/revoke (Technician). */
    public function revokeTill(Request $request, string $tenant, string $device): JsonResponse
    {
        $t = $this->find($tenant);
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']]);
        $model = DB::transaction(function () use ($t, $device, $data) {
            $model = Str::isUuid($device) ? Device::where('tenant_id', $t->id)->whereKey($device)->lockForUpdate()->first() : null;
            if (! $model) {
                throw new ApiException('not_found', 'No till by that id in this business.', 404);
            }
            if (! $model->isRevoked()) {
                $model->forceFill(['revoked_at' => now(), 'revocation_reason' => 'Inkgenius: '.$data['reason']])->save();
                $model->tokens()->delete();
                Audit::record('device.revoked', $model, ['reason' => $data['reason'], 'by' => 'inkgenius'], tenantId: $t->id);
            }

            return $model;
        });

        return ApiResponse::ok($model->toApi());
    }

    /** GET /platform/plans */
    public function plans(PlanCatalog $plans): JsonResponse
    {
        return ApiResponse::ok(collect(array_keys((array) config('inkypos.plans')))->map(function (string $code) use ($plans) {
            $p = $plans->get($code);

            return ['code' => $p->code, 'name' => $p->name, 'limits' => $p->limits, 'features' => $p->features];
        })->values());
    }

    private function find(string $id): Tenant
    {
        return (Str::isUuid($id) ? Tenant::find($id) : null) ?? throw new ApiException('not_found', 'No business by that id.', 404);
    }

    /** @return array<string, mixed> */
    private function summary(Tenant $t, ?Subscription $s): array
    {
        $s ??= $this->across(fn () => Subscription::with('plan')->where('tenant_id', $t->id)->first());

        return [
            'id' => $t->id,
            'name' => $t->name,
            'status' => $t->status,
            'status_reason' => $t->status_reason,
            'business_type' => $t->business_type ?? 'retail',
            'created_at' => $t->created_at?->toIso8601String(),
            'activated_at' => $t->activated_at?->toIso8601String(),
            'subscription' => $s ? [
                'plan' => $s->plan?->code,
                'plan_name' => $s->plan?->name,
                'status' => $s->status,
                'current_period_ends_at' => $s->current_period_ends_at?->toIso8601String(),
            ] : null,
        ];
    }
}
