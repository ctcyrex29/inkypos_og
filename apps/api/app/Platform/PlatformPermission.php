<?php

namespace App\Platform;

/** What Inkgenius staff may do in the platform portal (see PlatformRole for who has which). */
enum PlatformPermission: string
{
    case ViewBusinesses = 'businesses.view';
    case CreateBusinesses = 'businesses.create';
    case ActivateBusinesses = 'businesses.activate';
    case ManageSubscriptions = 'subscriptions.manage';
    case SupportBusinesses = 'businesses.support';
    case ManageDevices = 'devices.manage';
    case ViewAudit = 'audit.view';
    case ManagePlatformUsers = 'platform_users.manage';
}
