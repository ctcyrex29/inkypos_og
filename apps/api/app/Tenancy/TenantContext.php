<?php

namespace App\Tenancy;

use App\Models\Device;
use App\Models\Membership;
use App\Models\Tenant;
use Closure;

/**
 * The tenant the current request acts for. Set only by ResolveTenant from the
 * authenticated token, never from request input. Bound as a scoped instance,
 * so it resets per request (including under Octane).
 */
final class TenantContext
{
    private ?Tenant $tenant = null;

    private ?Membership $membership = null;

    private ?Device $device = null;

    private int $bypassDepth = 0;

    public function set(Tenant $tenant, ?Membership $membership = null, ?Device $device = null): void
    {
        $this->tenant = $tenant;
        $this->membership = $membership;
        $this->device = $device;
    }

    public function clear(): void
    {
        $this->tenant = $this->membership = $this->device = null;
    }

    public function has(): bool
    {
        return $this->tenant !== null;
    }

    public function tenant(): Tenant
    {
        return $this->tenant ?? throw new MissingTenantContext;
    }

    public function id(): ?string
    {
        return $this->tenant?->id;
    }

    public function membership(): ?Membership
    {
        return $this->membership;
    }

    public function device(): ?Device
    {
        return $this->device;
    }

    /**
     * Run code for a specific tenant (seeders, queued jobs, console commands).
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    public function run(Tenant $tenant, Closure $callback): mixed
    {
        $previous = [$this->tenant, $this->membership, $this->device];
        $this->set($tenant);
        try {
            return $callback();
        } finally {
            [$this->tenant, $this->membership, $this->device] = $previous;
        }
    }

    /**
     * Deliberately read across tenants (platform administration, migrations of data).
     * Every use should be reviewable by searching for this method.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    public function acrossTenants(Closure $callback): mixed
    {
        $this->bypassDepth++;
        try {
            return $callback();
        } finally {
            $this->bypassDepth--;
        }
    }

    public function bypassed(): bool
    {
        return $this->bypassDepth > 0;
    }
}
