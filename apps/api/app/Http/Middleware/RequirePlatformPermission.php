<?php

namespace App\Http\Middleware;

use App\Http\ApiException;
use App\Models\PlatformUser;
use App\Platform\PlatformPermission;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `platform:<permission>` — an Inkgenius Technologies staff token whose role
 * allows the action. Business users and tills never pass, whatever their role.
 */
class RequirePlatformPermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $principal = $request->user();
        if (! $principal instanceof PlatformUser || ! $principal->tokenCan('platform')) {
            throw ApiException::forbidden('This is for Inkgenius Technologies staff only.');
        }
        if (! $principal->isActive()) {
            throw ApiException::forbidden('This account is switched off.');
        }
        // "self": routes for finishing sign-in (who am I, sign out, new password, authenticator set-up).
        if ($permission === 'self') {
            return $next($request);
        }
        if ($pending = $principal->setupPending()) {
            throw new ApiException($pending, $pending === 'password_change_required'
                ? 'Choose a new password to replace the temporary one.'
                : 'Set up your authenticator app before using the portal.', 403);
        }
        if (! $principal->allows(PlatformPermission::from($permission))) {
            throw ApiException::forbidden("Your role ({$principal->role->label()}) cannot do this.");
        }

        return $next($request);
    }
}
