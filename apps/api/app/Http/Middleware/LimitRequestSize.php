<?php

namespace App\Http\Middleware;

use App\Http\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses oversized request bodies before any work is done on them, so a
 * client cannot tie up workers or memory with huge uploads. The biggest
 * legitimate body is a sync batch (up to 100 events), well under the sync cap.
 */
class LimitRequestSize
{
    public const DEFAULT_BYTES = 512 * 1024;

    public const SYNC_BYTES = 4 * 1024 * 1024;

    public function handle(Request $request, Closure $next): Response
    {
        $max = $request->is('api/v1/sync/events') ? self::SYNC_BYTES : self::DEFAULT_BYTES;
        $declared = (int) $request->headers->get('Content-Length', '0');
        if ($declared > $max || strlen((string) $request->getContent()) > $max) {
            throw new ApiException('payload_too_large', 'The request is too large.', 413);
        }

        return $next($request);
    }
}
