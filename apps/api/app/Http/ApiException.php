<?php

namespace App\Http;

use RuntimeException;

/** An expected API failure with a contract error code (apiErrorCodeSchema in packages/core). */
class ApiException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status,
    ) {
        parent::__construct($message);
    }

    public static function forbidden(string $message = 'This action is not allowed.'): self
    {
        return new self('forbidden', $message, 403);
    }

    public static function unauthenticated(string $message = 'Authentication required.'): self
    {
        return new self('unauthenticated', $message, 401);
    }

    public static function deviceRevoked(): self
    {
        return new self('device_revoked', 'This device has been revoked.', 403);
    }

    public static function subscriptionInactive(): self
    {
        return new self('subscription_inactive', 'The subscription for this business is not active.', 403);
    }

    public static function planLimit(string $what): self
    {
        return new self('plan_limit_reached', "Your plan does not allow more {$what}.", 403);
    }

    public static function conflict(string $message): self
    {
        return new self('conflict', $message, 409);
    }
}
