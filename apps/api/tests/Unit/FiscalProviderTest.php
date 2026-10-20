<?php

namespace Tests\Unit;

use App\Fiscal\FiscalProvider;
use InvalidArgumentException;
use Tests\TestCase;

class FiscalProviderTest extends TestCase
{
    public function test_fiscalisation_is_disabled_by_default(): void
    {
        $provider = $this->app->make(FiscalProvider::class);

        $this->assertSame('disabled', $provider->name());
        $this->assertFalse($provider->isEnabled());
        $this->assertSame('not_submitted', $provider->submitSale(['sale_id' => 'x'])->status);
    }

    public function test_unknown_provider_fails_loudly(): void
    {
        config(['inkypos.fiscal.provider' => 'some-unverified-provider']);
        $this->app->forgetInstance(FiscalProvider::class);

        $this->expectException(InvalidArgumentException::class);
        $this->app->make(FiscalProvider::class);
    }
}
