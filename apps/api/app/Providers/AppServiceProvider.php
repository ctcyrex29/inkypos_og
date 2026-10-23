<?php

namespace App\Providers;

use App\Fiscal\DisabledFiscalProvider;
use App\Fiscal\FiscalProvider;
use App\Tenancy\TenantContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use InvalidArgumentException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Scoped: a fresh context per request/job, even on long-lived workers.
        $this->app->scoped(TenantContext::class);

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
        // Credential endpoints: per account/device identifier and per IP.
        RateLimiter::for('auth', function (Request $request) {
            $identity = strtolower((string) ($request->input('email') ?? $request->input('device_id') ?? ''));

            return [
                Limit::perMinute(10)->by('auth-id:'.$identity.'|'.$request->ip()),
                Limit::perMinute(60)->by('auth-ip:'.$request->ip()),
            ];
        });

        // Every API request from one address, whoever it signs in as: caps one machine
        // flooding the API (many tokens, bad tokens, unauthenticated probing). A whole
        // shop behind one router stays far below it; real DDoS needs an edge proxy (docs/SECURITY.md).
        RateLimiter::for('per-ip', fn (Request $request) => Limit::perMinute((int) config('inkypos.rate_limits.per_ip_per_minute'))->by('ip:'.$request->ip()));

        RateLimiter::for('api', function (Request $request) {
            $principal = $request->user();

            return Limit::perMinute(240)->by($principal ? $principal::class.':'.$principal->getKey() : 'ip:'.$request->ip());
        });
    }
}
