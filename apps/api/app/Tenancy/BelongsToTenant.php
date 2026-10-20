<?php

namespace App\Tenancy;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * For business data owned by one tenant. Reads are filtered to the current
 * tenant and fail closed when there is none; writes take the tenant from
 * context and refuse to write into a different tenant.
 *
 * Principals (users, memberships, devices) do not use this trait because
 * they are looked up during authentication, before a tenant is known.
 *
 * @mixin Model
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope('tenant', function (Builder $query) {
            $context = app(TenantContext::class);
            if ($context->bypassed()) {
                return;
            }
            if (! $context->has()) {
                throw new MissingTenantContext(static::class.' was queried without a tenant context.');
            }
            $query->where($query->qualifyColumn('tenant_id'), $context->id());
        });

        static::creating(function (Model $model) {
            $context = app(TenantContext::class);
            if ($model->getAttribute('tenant_id') === null) {
                $model->setAttribute('tenant_id', $context->tenant()->id);
            } elseif ($context->has() && $model->getAttribute('tenant_id') !== $context->id()) {
                throw new MissingTenantContext('Refusing to create '.static::class.' for a different tenant.');
            }
        });

        static::updating(function (Model $model) {
            if ($model->isDirty('tenant_id')) {
                throw new MissingTenantContext('tenant_id of '.static::class.' cannot change.');
            }
        });
    }

    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
