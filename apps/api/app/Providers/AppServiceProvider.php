<?php

namespace App\Providers;

use App\Fiscal\DisabledFiscalProvider;
use App\Fiscal\FiscalProvider;
use Illuminate\Support\ServiceProvider;
use InvalidArgumentException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(FiscalProvider::class, function () {
            $provider = config('inkypos.fiscal.provider');

            return match ($provider) {
                'disabled' => new DisabledFiscalProvider,
                default => throw new InvalidArgumentException(
                    "Unknown fiscal provider [{$provider}]. Only 'disabled' is available until Phase 8."
                ),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
