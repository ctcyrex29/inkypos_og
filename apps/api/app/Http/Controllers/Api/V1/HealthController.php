<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;

/**
 * Liveness probe used by POS clients to decide whether the API is reachable.
 * Deliberately touches no database so it stays cheap and unauthenticated.
 */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return ApiResponse::ok([
            'status' => 'ok',
            'service' => 'inkypos-api',
            'api_version' => ApiResponse::VERSION,
            'server_time' => now()->toIso8601String(),
        ]);
    }
}
