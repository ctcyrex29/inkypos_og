<?php

namespace App\Http\Middleware;

use App\Http\ApiException;
use App\Models\Device;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** `principal:user` or `principal:device` — which kind of token may call the route. */
class EnsurePrincipal
{
    public function handle(Request $request, Closure $next, string $kind): Response
    {
        $principal = $request->user();
        $ok = match ($kind) {
            'user' => $principal instanceof User && $principal->tokenCan('user'),
            'device' => $principal instanceof Device && $principal->tokenCan('device'),
            default => false,
        };

        if (! $ok) {
            throw ApiException::forbidden("This endpoint requires a {$kind} token.");
        }

        return $next($request);
    }
}
