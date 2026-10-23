<?php

namespace App\Platform;

/**
 * Inkgenius Technologies staff roles (the software owner's side). Separate from
 * the roles inside a business (App\Auth\Role). Mirrored by platformRoleSchema in
 * packages/core/src/api/platform.ts.
 *
 *                       Admin  Support  Technician  Accounts
 *   view businesses       x       x         x          x
 *   create businesses     x                            x
 *   activate / suspend    x                            x
 *   subscriptions         x                            x
 *   support (staff, pw)   x       x
 *   tills (devices)       x                 x
 *   activity log          x       x         x
 *   Inkgenius staff       x
 */
enum PlatformRole: string
{
    case Administrator = 'administrator';
    case Support = 'support';
    case Technician = 'technician';
    case Accounts = 'accounts';

    public function can(PlatformPermission $permission): bool
    {
        return match ($permission) {
            PlatformPermission::ViewBusinesses => true,
            PlatformPermission::CreateBusinesses, PlatformPermission::ActivateBusinesses, PlatformPermission::ManageSubscriptions => in_array($this, [self::Administrator, self::Accounts], true),
            PlatformPermission::SupportBusinesses => in_array($this, [self::Administrator, self::Support], true),
            PlatformPermission::ManageDevices => in_array($this, [self::Administrator, self::Technician], true),
            PlatformPermission::ViewAudit => $this !== self::Accounts,
            PlatformPermission::ManagePlatformUsers => $this === self::Administrator,
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::Administrator => 'Administrator',
            self::Support => 'Support',
            self::Technician => 'Technician',
            self::Accounts => 'Accounts Department',
        };
    }
}
