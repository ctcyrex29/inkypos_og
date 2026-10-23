<?php

namespace App\Auth;

enum Permission: string
{
    case ViewStructure = 'structure.view';
    case ManageStructure = 'structure.manage';
    case ManageDevices = 'devices.manage';
    case ViewEntitlements = 'entitlements.view';
    case ManageCatalogue = 'catalogue.manage';
    case ManageStaff = 'staff.manage';
    case ViewReports = 'reports.view';
    case ManageAccounts = 'accounts.manage';
}
