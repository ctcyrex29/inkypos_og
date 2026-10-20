<?php

namespace App\Auth;

enum Permission: string
{
    case ViewStructure = 'structure.view';
    case ManageStructure = 'structure.manage';
    case ManageDevices = 'devices.manage';
    case ViewEntitlements = 'entitlements.view';
    case ManageSubscription = 'subscription.manage';
    case ManageCatalogue = 'catalogue.manage';
}
