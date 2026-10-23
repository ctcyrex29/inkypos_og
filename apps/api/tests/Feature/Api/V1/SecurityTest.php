<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Catalogue\Catalogue;
use App\Models\Tenant;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

/** SQL injection, request-size and rate limits, and response headers (docs/SECURITY.md). */
class SecurityTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private Tenant $tenant;

    /** @var array<string, string> */
    private array $headers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->makeTenant('Shop', 'growth');
        app(TenantContext::class)->run($this->tenant, fn () => app(Catalogue::class)->seedDefaults());
        $this->headers = $this->userHeaders($this->makeUser($this->tenant, Role::Manager), $this->tenant);
        foreach (['Bread 50% off', 'Milk_1L', 'Sugar'] as $i => $name) {
            $this->postJson('/api/v1/products', ['sku' => "SKU{$i}", 'name' => $name, 'unit_price_minor' => 100, 'tax_code' => 'VAT15', 'tax_rate_bp' => 1500], $this->headers)->assertCreated();
        }
    }

    private function names(string $search): array
    {
        return array_column($this->getJson('/api/v1/products?'.http_build_query(['search' => $search]), $this->headers)->assertOk()->json('data'), 'name');
    }

    public function test_search_text_is_never_run_as_sql(): void
    {
        foreach (["' OR '1'='1", "'; DROP TABLE products; --", '" OR 1=1 --', "x') UNION SELECT password FROM users --"] as $attack) {
            $this->assertSame([], $this->names($attack), $attack);
            $this->getJson('/api/v1/customers?'.http_build_query(['search' => $attack]), $this->headers)->assertOk()->assertJsonPath('data', []);
            $this->getJson('/api/v1/audit?'.http_build_query(['action' => $attack]), $this->headers)->assertOk();
        }
        $this->assertSame(3, DB::table('products')->count(), 'nothing dropped or changed');
    }

    public function test_wildcards_typed_by_a_user_match_themselves(): void
    {
        $this->assertSame(['Bread 50% off'], $this->names('%'), 'a bare % finds a literal percent sign, not everything');
        $this->assertSame([], $this->names('Su%r'));
        $this->assertSame(['Bread 50% off'], $this->names('50%'));
        $this->assertSame(['Milk_1L'], $this->names('k_1'));
        $this->assertSame([], $this->names('Mil__L'));
        $this->assertSame(['Sugar'], $this->names('uga'));
    }

    public function test_oversized_requests_are_refused_before_any_work(): void
    {
        $huge = ['sku' => 'BIG', 'name' => str_repeat('x', 600 * 1024), 'unit_price_minor' => 1, 'tax_code' => 'Z', 'tax_rate_bp' => 0];
        $this->postJson('/api/v1/products', $huge, $this->headers)->assertStatus(413)->assertJsonPath('error.code', 'payload_too_large');
        $this->assertSame(0, DB::table('products')->where('sku', 'BIG')->count());
    }

    public function test_one_address_is_capped_across_the_whole_api(): void
    {
        config(['inkypos.rate_limits.per_ip_per_minute' => 5]);
        $from = fn (string $ip) => $this->withServerVariables(['REMOTE_ADDR' => $ip]);
        for ($i = 0; $i < 5; $i++) {
            $from('10.0.0.9')->getJson('/api/v1/health')->assertOk();
        }
        $from('10.0.0.9')->getJson('/api/v1/health')->assertStatus(429)->assertJsonPath('error.code', 'rate_limited');
        $from('10.0.0.10')->getJson('/api/v1/health')->assertOk(); // other addresses are unaffected
    }

    public function test_repeated_failed_logins_are_throttled(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'victim@example.test', 'password' => "guess{$i}", 'device_name' => 'x'])->assertStatus(401);
        }
        $this->postJson('/api/v1/auth/login', ['email' => 'victim@example.test', 'password' => 'guess', 'device_name' => 'x'])->assertStatus(429);
    }

    public function test_responses_carry_security_headers(): void
    {
        $this->getJson('/api/v1/health')->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'no-referrer');
    }
}
