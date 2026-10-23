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
});
