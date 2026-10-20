<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\DeviceAuthController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\EntitlementController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\StructureController;
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
        });
    });
});
