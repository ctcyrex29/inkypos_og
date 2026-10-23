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
        if (! $principal->allows(PlatformPermission::from($permission))) {
            throw ApiException::forbidden("Your role ({$principal->role->label()}) cannot do this.");
        }

        return $next($request);
    }
}
