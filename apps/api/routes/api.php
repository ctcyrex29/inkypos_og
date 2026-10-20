<?php

use App\Http\Controllers\Api\V1\HealthController;
use Illuminate\Support\Facades\Route;

/*
| Versioned API. Endpoints for later phases are listed in
| packages/core/src/api/contracts.ts (ENDPOINTS) and docs/ARCHITECTURE.md.
*/

Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('health', HealthController::class)->name('health');
});
