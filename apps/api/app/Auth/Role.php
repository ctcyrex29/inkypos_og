<?php

namespace App\Auth;

/** Mirrors roleSchema in packages/core/src/auth/contracts.ts. */
enum Role: string
{
    case Owner = 'owner';
    case Manager = 'manager';
    case Cashier = 'cashier';

    public function can(Permission $permission): bool
    {
        return match ($permission) {
            Permission::ViewStructure, Permission::ViewEntitlements => true,
            Permission::ManageStructure, Permission::ManageDevices => $this !== self::Cashier,
            Permission::ManageSubscription => $this === self::Owner,
        };
    }
}
