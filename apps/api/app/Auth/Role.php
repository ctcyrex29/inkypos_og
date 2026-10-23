<?php

namespace App\Auth;

/**
 * Roles inside a business (a tenant). Mirrors roleSchema in packages/core/src/auth/contracts.ts.
 * A manager can do everything a cashier can, including selling on the tills.
 * Inkgenius Technologies staff have their own roles (App\Platform\PlatformRole).
 */
enum Role: string
{
    case Manager = 'manager';
    case Cashier = 'cashier';

    public function can(Permission $permission): bool
    {
        return match ($permission) {
            Permission::ViewStructure, Permission::ViewEntitlements => true,
            Permission::ManageStructure, Permission::ManageDevices, Permission::ManageCatalogue, Permission::ManageStaff,
            Permission::ViewReports, Permission::ManageAccounts => $this === self::Manager,
        };
    }
}
