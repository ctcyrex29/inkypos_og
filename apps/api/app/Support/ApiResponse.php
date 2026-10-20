<?php

namespace App\Support;

use App\Http\Middleware\AssignRequestId;
use Illuminate\Http\JsonResponse;

/**
 * Response envelopes shared with the TypeScript client
 * (packages/core/src/api/contracts.ts): `{ data, meta }` and `{ error, meta }`.
 */
final class ApiResponse
{
    public const VERSION = 'v1';

    public static function ok(mixed $data, int $status = 200): JsonResponse
    {
        return new JsonResponse(['data' => $data, 'meta' => self::meta()], $status);
    }

    /**
     * @param  array<string, list<string>>|null  $details
     */
    public static function error(string $code, string $message, int $status, ?array $details = null): JsonResponse
    {
        $error = ['code' => $code, 'message' => $message];
        if ($details !== null) {
            $error['details'] = $details;
        }

        return new JsonResponse(['error' => $error, 'meta' => self::meta()], $status);
    }

    /**
     * @return array{request_id: string, api_version: string}
     */
    private static function meta(): array
    {
        return [
            'request_id' => AssignRequestId::current(),
            'api_version' => self::VERSION,
        ];
    }
}
