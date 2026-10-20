<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Accepts the client's X-Request-Id when it is well formed (so a POS device can
 * correlate its logs with ours), otherwise generates one. The id is added to
 * the log context and echoed on the response.
 */
class AssignRequestId
{
    public const HEADER = 'X-Request-Id';

    private const PATTERN = '/^[A-Za-z0-9._-]{8,128}$/';

    public function handle(Request $request, Closure $next): Response
    {
        $incoming = $request->headers->get(self::HEADER);
        $id = is_string($incoming) && preg_match(self::PATTERN, $incoming) === 1
            ? $incoming
            : (string) Str::uuid7();

        $request->headers->set(self::HEADER, $id);
        Context::add('request_id', $id);

        $response = $next($request);
        $response->headers->set(self::HEADER, $id);

        return $response;
    }

    /** Request id of the current request, or a fresh one outside the API middleware. */
    public static function current(): string
    {
        $id = Context::get('request_id');
        if (! is_string($id)) {
            $id = (string) Str::uuid7();
            Context::add('request_id', $id);
        }

        return $id;
    }
}
