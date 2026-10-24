<?php

namespace App\Http\Middleware;

use App\Http\ApiException;
use App\Models\Device;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Establishes the tenant from the authenticated principal, never from the body.
 *  - Device token: the device's own tenant. A mismatching X-Tenant-Id is refused.
 *  - User token:   X-Tenant-Id is required and must match one of the user's memberships.
 *
 * Runs before route-model binding (see bootstrap/app.php) so bound models are tenant-scoped.
 */
class ResolveTenant
{
    public const HEADER = 'X-Tenant-Id';

    /** Resolved on every use: controllers, services and middleware can outlive a request (route caching, Octane). */
    private function context(): TenantContext
    {
        return app(TenantContext::class);
    }

    public function handle(Request $request, Closure $next): Response
    {
        $principal = $request->user();
        $requested = $request->headers->get(self::HEADER);

        if ($principal instanceof Device) {
            if ($principal->isRevoked()) {
                throw ApiException::deviceRevoked();
            }
            if ($requested !== null && $requested !== $principal->tenant_id) {
                throw ApiException::forbidden('This device belongs to a different business.');
            }
            $tenant = Tenant::findOrFail($principal->tenant_id);
            $this->assertActive($tenant);
            $this->context()->set($tenant, null, $principal);

            if ($principal->last_seen_at === null || $principal->last_seen_at->lt(now()->subMinutes(5))) {
                $principal->forceFill(['last_seen_at' => now()])->saveQuietly();
            }
        } elseif ($principal instanceof User) {
            // Signed in with a temporary password from Inkgenius: nothing until it is replaced (POST /me/password).
            if ($principal->password_must_change) {
                throw new ApiException('password_change_required', 'Choose a new password to replace the temporary one.', 403);
            }
            if (! is_string($requested) || ! Str::isUuid($requested)) {
                throw new ApiException('validation_failed', 'The X-Tenant-Id header is required.', 400);
            }
            $membership = $principal->memberships()->with('tenant')->where('tenant_id', $requested)->first();
            if (! $membership || ! $membership->isActive()) {
                throw ApiException::forbidden('You are not a member of this business.');
            }
            $this->assertActive($membership->tenant);
            $this->context()->set($membership->tenant, $membership);
        } else {
            throw ApiException::unauthenticated();
        }

        return $next($request);
    }

    private function assertActive(Tenant $tenant): void
    {
        if ($tenant->isPending()) {
            throw new ApiException('business_pending', 'This business is waiting for Inkgenius Technologies to activate it.', 403);
        }
        if (! $tenant->isActive()) {
            throw ApiException::forbidden('This business is suspended.');
        }
    }
}
