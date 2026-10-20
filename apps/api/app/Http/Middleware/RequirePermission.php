<?php

namespace App\Http\Middleware;

use App\Auth\Permission;
use App\Http\ApiException;
use App\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** `permission:<value>` — checked against the current membership; devices get read-only permissions. */
class RequirePermission
{
    private const DEVICE_PERMISSIONS = [Permission::ViewStructure, Permission::ViewEntitlements];

    public function __construct(private readonly TenantContext $context) {}

    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $required = Permission::from($permission);
        $membership = $this->context->membership();

        $allowed = $membership
            ? $membership->can($required)
            : $this->context->device() !== null && in_array($required, self::DEVICE_PERMISSIONS, true);

        if (! $allowed) {
            throw ApiException::forbidden();
        }

        return $next($request);
    }
}
