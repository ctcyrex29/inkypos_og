<?php

use App\Http\Controllers\Api\V1\AccountingController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CatalogueController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\PurchaseController;
use App\Http\Controllers\Api\V1\RecipeController;
use App\Http\Controllers\Api\V1\ReportsController;
use App\Http\Controllers\Api\V1\StockController;
use App\Http\Controllers\Api\V1\SupplierController;
use App\Http\Controllers\Api\V1\DeviceAuthController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\EntitlementController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\Platform\BusinessController;
use App\Http\Controllers\Api\V1\Platform\PlatformAuthController;
use App\Http\Controllers\Api\V1\Platform\PlatformUserController;
use App\Http\Controllers\Api\V1\Platform\AuditLogController;
use App\Http\Controllers\Api\V1\Platform\AnalyticsController;
use App\Http\Controllers\Api\V1\Platform\InvoiceController;
use App\Http\Controllers\Api\V1\Platform\SupportTicketController;
use App\Http\Controllers\Api\V1\StaffController;
use App\Http\Controllers\Api\V1\StructureController;
use App\Http\Controllers\Api\V1\SyncController;
use Illuminate\Support\Facades\Route;

/*
| Versioned API. The same catalogue is in packages/core/src/api/contracts.ts (ENDPOINTS).
*/

Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('health', HealthController::class)->name('health');

    Route::middleware('throttle:auth')->group(function () {
        Route::post('auth/signup', [AuthController::class, 'signup'])->name('auth.signup');
        Route::post('auth/login', [AuthController::class, 'login'])->name('auth.login');
        Route::post('auth/refresh', [AuthController::class, 'refresh'])->name('auth.refresh');
        Route::post('auth/device/challenge', [DeviceAuthController::class, 'challenge'])->name('auth.device.challenge');
        Route::post('auth/device/token', [DeviceAuthController::class, 'token'])->name('auth.device.token');
    });

    Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
        Route::middleware('principal:user')->group(function () {
            Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
            Route::get('me', [AuthController::class, 'me'])->name('me');
            Route::post('me/password', [AuthController::class, 'changePassword'])->middleware('throttle:auth')->name('me.password');
        });

        // Everything below acts inside exactly one tenant.
        Route::middleware('tenant')->group(function () {
            Route::get('branches', [StructureController::class, 'branches'])
                ->middleware('permission:structure.view')->name('branches.index');
            Route::post('branches', [StructureController::class, 'createBranch'])
                ->middleware('permission:structure.manage')->name('branches.store');
            Route::get('registers', [StructureController::class, 'registers'])
                ->middleware('permission:structure.view')->name('registers.index');
            Route::post('branches/{branch}/registers', [StructureController::class, 'createRegister'])
                ->middleware('permission:structure.manage')->name('registers.store');

            Route::get('devices', [DeviceController::class, 'index'])
                ->middleware('permission:devices.manage')->name('devices.index');
            Route::post('devices', [DeviceController::class, 'store'])
                ->middleware(['principal:user', 'permission:devices.manage'])->name('devices.store');
            Route::delete('devices/{device}', [DeviceController::class, 'destroy'])
                ->middleware(['principal:user', 'permission:devices.manage'])->name('devices.destroy');

            Route::get('entitlements', EntitlementController::class)
                ->middleware('permission:entitlements.view')->name('entitlements');

            Route::post('sync/events', [SyncController::class, 'push'])
                ->middleware('principal:device')->name('sync.push');
            Route::get('sync/changes', [CatalogueController::class, 'changes'])
                ->middleware('permission:structure.view')->name('sync.changes');

            Route::get('products', [CatalogueController::class, 'products'])
                ->middleware('permission:structure.view')->name('products.index');
            Route::post('products', [CatalogueController::class, 'storeProduct'])
                ->middleware(['principal:user', 'permission:catalogue.manage'])->name('products.store');
            Route::patch('products/{product}', [CatalogueController::class, 'updateProduct'])
                ->middleware(['principal:user', 'permission:catalogue.manage'])->name('products.update');
            Route::get('payment-methods', [CatalogueController::class, 'paymentMethods'])
                ->middleware('permission:structure.view')->name('payment-methods.index');
            Route::patch('payment-methods/{paymentMethod}', [CatalogueController::class, 'updatePaymentMethod'])
                ->middleware(['principal:user', 'permission:catalogue.manage'])->name('payment-methods.update');
            Route::get('exchange-rates', [CatalogueController::class, 'exchangeRates'])
                ->middleware('permission:structure.view')->name('exchange-rates.index');
            Route::post('exchange-rates', [CatalogueController::class, 'storeExchangeRate'])
                ->middleware(['principal:user', 'permission:catalogue.manage'])->name('exchange-rates.store');
            Route::get('stock', [CatalogueController::class, 'stock'])
                ->middleware('permission:structure.view')->name('stock.index');

            // Back office (OG-1): categories, customers, suppliers, stock, goods received.
            Route::get('categories', [CategoryController::class, 'index'])
                ->middleware('permission:structure.view')->name('categories.index');
            Route::post('categories', [CategoryController::class, 'store'])
                ->middleware(['principal:user', 'permission:catalogue.manage'])->name('categories.store');
            Route::patch('categories/{category}', [CategoryController::class, 'update'])
                ->middleware(['principal:user', 'permission:catalogue.manage'])->name('categories.update');

            Route::middleware(['principal:user', 'permission:catalogue.manage'])->group(function () {
                Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
                Route::get('customers/{customer}', [CustomerController::class, 'show'])->name('customers.show');
                Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
                Route::patch('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');

                Route::get('suppliers', [SupplierController::class, 'index'])->name('suppliers.index');
                Route::post('suppliers', [SupplierController::class, 'store'])->name('suppliers.store');
                Route::patch('suppliers/{supplier}', [SupplierController::class, 'update'])->name('suppliers.update');

                Route::get('stock/levels', [StockController::class, 'levels'])->name('stock.levels');
                Route::get('stock/movements', [StockController::class, 'movements'])->name('stock.movements');
                Route::post('stock/adjustments', [StockController::class, 'adjust'])->name('stock.adjust');

                Route::get('products/{product}/recipe', [RecipeController::class, 'show'])->name('recipes.show');
                Route::put('products/{product}/recipe', [RecipeController::class, 'update'])->name('recipes.update');

                Route::get('purchases', [PurchaseController::class, 'index'])->name('purchases.index');
                Route::get('purchases/{purchase}', [PurchaseController::class, 'show'])->name('purchases.show');
                Route::post('purchases', [PurchaseController::class, 'store'])->name('purchases.store');
            });

            // Reports and accounting (OG-2).
            Route::middleware(['principal:user', 'permission:reports.view'])->group(function () {
                Route::get('reports/sales', [ReportsController::class, 'sales'])->name('reports.sales');
                Route::get('reports/vat', [ReportsController::class, 'vat'])->name('reports.vat');
                Route::get('reports/profit', [ReportsController::class, 'profit'])->name('reports.profit');
                Route::get('reports/shifts', [ReportsController::class, 'shifts'])->name('reports.shifts');
                Route::get('reports/shifts/{shift}', [ReportsController::class, 'shift'])->name('reports.shift');
                Route::get('audit', [ReportsController::class, 'audit'])->name('audit.index');
            });
            Route::middleware(['principal:user', 'permission:accounts.manage'])->group(function () {
                Route::get('business', [ReportsController::class, 'showBusiness'])->name('business.show');
                Route::patch('business', [ReportsController::class, 'updateBusiness'])->name('business.update');
                Route::get('expenses', [AccountingController::class, 'expenses'])->name('expenses.index');
                Route::post('expenses', [AccountingController::class, 'storeExpense'])->name('expenses.store');
                Route::post('supplier-payments', [AccountingController::class, 'storeSupplierPayment'])->name('supplier-payments.store');
                Route::get('supplier-balances', [AccountingController::class, 'supplierBalances'])->name('supplier-balances');
                Route::get('cashbook', [AccountingController::class, 'cashbook'])->name('cashbook');
            });

            Route::get('staff', [StaffController::class, 'index'])
                ->middleware(['principal:user', 'permission:staff.manage'])->name('staff.index');
            Route::post('staff', [StaffController::class, 'store'])
                ->middleware(['principal:user', 'permission:staff.manage'])->name('staff.store');
            Route::patch('staff/{user}', [StaffController::class, 'update'])
                ->middleware(['principal:user', 'permission:staff.manage'])->name('staff.update');
            Route::put('staff/{user}/pin', [StaffController::class, 'setPin'])
                ->middleware(['principal:user', 'permission:staff.manage'])->name('staff.pin.set');
            Route::delete('staff/{user}/pin', [StaffController::class, 'clearPin'])
                ->middleware(['principal:user', 'permission:staff.manage'])->name('staff.pin.clear');
        });
    });

    /*
    | Inkgenius Technologies staff (the platform portal). Separate accounts and tokens:
    | business users and tills are refused here, and platform tokens are refused on
    | business routes (ResolveTenant only accepts users and devices).
    */
    Route::prefix('platform')->name('platform.')->group(function () {
        Route::post('auth/login', [PlatformAuthController::class, 'login'])->middleware('throttle:auth')->name('auth.login');

        Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
            // "self": reachable while a temporary password or the authenticator set-up is still pending.
            Route::middleware('platform:self')->group(function () {
                Route::get('me', [PlatformAuthController::class, 'me'])->name('me');
                Route::post('auth/logout', [PlatformAuthController::class, 'logout'])->name('auth.logout');
                Route::post('me/password', [PlatformAuthController::class, 'changePassword'])->middleware('throttle:auth')->name('me.password');
                Route::post('me/two-factor', [PlatformAuthController::class, 'setupTwoFactor'])->name('me.two-factor');
                Route::post('me/two-factor/confirm', [PlatformAuthController::class, 'confirmTwoFactor'])->middleware('throttle:auth')->name('me.two-factor.confirm');
            });

            Route::get('businesses', [BusinessController::class, 'index'])->middleware('platform:businesses.view')->name('businesses.index');
            Route::post('businesses', [BusinessController::class, 'store'])->middleware('platform:businesses.create')->name('businesses.store');
            Route::get('businesses/{tenant}', [BusinessController::class, 'show'])->middleware('platform:businesses.view')->name('businesses.show');
            Route::post('businesses/{tenant}/activate', [BusinessController::class, 'activate'])->middleware('platform:businesses.activate')->name('businesses.activate');
            Route::post('businesses/{tenant}/suspend', [BusinessController::class, 'suspend'])->middleware('platform:businesses.activate')->name('businesses.suspend');
            Route::patch('businesses/{tenant}/subscription', [BusinessController::class, 'updateSubscription'])->middleware('platform:subscriptions.manage')->name('businesses.subscription');
            Route::post('businesses/{tenant}/staff/{user}/reset-password', [BusinessController::class, 'resetManagerPassword'])->middleware('platform:businesses.support')->name('businesses.reset-password');
            Route::post('businesses/{tenant}/tills/{device}/revoke', [BusinessController::class, 'revokeTill'])->middleware('platform:devices.manage')->name('businesses.revoke-till');
            Route::get('plans', [BusinessController::class, 'plans'])->middleware('platform:businesses.view')->name('plans');

            Route::get('users', [PlatformUserController::class, 'index'])->middleware('platform:platform_users.manage')->name('users.index');
            Route::post('users', [PlatformUserController::class, 'store'])->middleware('platform:platform_users.manage')->name('users.store');
            Route::patch('users/{user}', [PlatformUserController::class, 'update'])->middleware('platform:platform_users.manage')->name('users.update');
            Route::post('users/{user}/reset-password', [PlatformUserController::class, 'resetPassword'])->middleware('platform:platform_users.manage')->name('users.reset-password');
            Route::post('users/{user}/reset-two-factor', [PlatformUserController::class, 'resetTwoFactor'])->middleware('platform:platform_users.manage')->name('users.reset-two-factor');

            Route::get('analytics', [AnalyticsController::class, 'index'])->middleware('platform:analytics.view')->name('analytics.index');

            Route::get('audit-logs', [AuditLogController::class, 'index'])->middleware('platform:audit.view')->name('audit-logs.index');
            Route::post('audit-logs', [AuditLogController::class, 'store'])->middleware('platform:audit.manage')->name('audit-logs.store');

            Route::get('invoices', [InvoiceController::class, 'index'])->middleware('platform:billing.view')->name('invoices.index');
            Route::post('invoices', [InvoiceController::class, 'store'])->middleware('platform:billing.manage')->name('invoices.store');
            Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->middleware('platform:billing.view')->name('invoices.show');
            Route::patch('invoices/{invoice}', [InvoiceController::class, 'update'])->middleware('platform:billing.manage')->name('invoices.update');

            Route::get('support-tickets', [SupportTicketController::class, 'index'])->middleware('platform:support.view')->name('support-tickets.index');
            Route::post('support-tickets', [SupportTicketController::class, 'store'])->middleware('platform:support.manage')->name('support-tickets.store');
            Route::get('support-tickets/{ticket}', [SupportTicketController::class, 'show'])->middleware('platform:support.view')->name('support-tickets.show');
            Route::patch('support-tickets/{ticket}', [SupportTicketController::class, 'update'])->middleware('platform:support.manage')->name('support-tickets.update');
            Route::post('support-tickets/{ticket}/messages', [SupportTicketController::class, 'addMessage'])->middleware('platform:support.manage')->name('support-tickets.messages.store');
        });
    });
});
