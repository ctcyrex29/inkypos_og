<?php

namespace App\Tenancy;

use LogicException;

/** A tenant-owned model was queried with no tenant in context. This is a bug, never a user error. */
final class MissingTenantContext extends LogicException
{
    public function __construct(string $message = 'Tenant-owned data was accessed without a tenant context.')
    {
        parent::__construct($message);
    }
}
