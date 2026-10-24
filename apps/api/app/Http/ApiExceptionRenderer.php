<?php

namespace App\Http;

use App\Support\ApiResponse;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use PDOException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Throwable;

/**
 * Maps every exception on /api/* to the shared error envelope. Error codes
 * mirror apiErrorCodeSchema in packages/core/src/api/contracts.ts.
 */
class ApiExceptionRenderer
{
    public function render(Throwable $e, Request $request): JsonResponse
    {
        return match (true) {
            $e instanceof ApiException => ApiResponse::error($e->errorCode, $e->getMessage(), $e->status),
            $e instanceof ValidationException => ApiResponse::error(
                'validation_failed', 'The given data was invalid.', 422, $e->errors()
            ),
            $e instanceof AuthenticationException => ApiResponse::error('unauthenticated', 'Authentication required.', 401),
            $e instanceof AuthorizationException,
            $e instanceof AccessDeniedHttpException => ApiResponse::error('forbidden', 'This action is not allowed.', 403),
            $e instanceof ModelNotFoundException,
            $e instanceof NotFoundHttpException => ApiResponse::error('not_found', 'Resource not found.', 404),
            $e instanceof MethodNotAllowedHttpException => ApiResponse::error('method_not_allowed', 'Method not allowed.', 405),
            $e instanceof TooManyRequestsHttpException => $this->withHeaders(
                ApiResponse::error('rate_limited', 'Too many requests.', 429), $e
            ),
            $e instanceof HttpExceptionInterface && $e->getStatusCode() < 500 => ApiResponse::error(
                match ($e->getStatusCode()) {
                    401 => 'unauthenticated',
                    403 => 'forbidden',
                    404 => 'not_found',
                    409 => 'conflict',
                    default => 'validation_failed',
                },
                $e->getMessage() ?: 'Bad request.',
                $e->getStatusCode(),
            ),
            // Database messages hold the SQL and its values (password hashes, personal details):
            // never sent, even in debug mode. The log has them, under the request id.
            default => ApiResponse::error(
                'server_error',
                config('app.debug') && ! $e instanceof QueryException && ! $e instanceof PDOException ? $e->getMessage() : 'An unexpected error occurred.',
                $e instanceof HttpExceptionInterface ? $e->getStatusCode() : 500,
            ),
        };
    }

    private function withHeaders(JsonResponse $response, HttpExceptionInterface $e): JsonResponse
    {
        $response->headers->add($e->getHeaders());

        return $response;
    }
}
