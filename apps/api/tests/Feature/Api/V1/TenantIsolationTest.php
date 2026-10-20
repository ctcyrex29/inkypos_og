<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Models\Branch;
use App\Models\Register;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

/**
 * Two businesses, A and B. Every tenant-scoped endpoint is attacked from A's
 * side using B's identifiers. test_every_tenant_route_is_covered keeps this
 * file honest when new routes are added.
 */
class TenantIsolationTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private Tenant $a;

    private Tenant $b;

    private User $ownerA;

    private Branch $branchB;

    private Register $registerB;

    /** Tenant routes exercised below, by route name. */
    private const COVERED = [
        'api.v1.branches.index', 'api.v1.branches.store', 'api.v1.registers.index', 'api.v1.registers.store',
        'api.v1.devices.index', 'api.v1.devices.store', 'api.v1.devices.destroy', 'api.v1.entitlements',
        'api.v1.sync.push', // cross-tenant cases in SyncTest (device_mismatch, per-tenant event ids)
        // CatalogueTest::test_cross_tenant_catalogue_access_is_refused covers these:
        'api.v1.sync.changes', 'api.v1.products.index', 'api.v1.products.store', 'api.v1.products.update',
        'api.v1.payment-methods.index', 'api.v1.payment-methods.update', 'api.v1.exchange-rates.index',
        'api.v1.exchange-rates.store', 'api.v1.stock.index',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = $this->makeTenant('A', 'growth');
        $this->b = $this->makeTenant('B', 'growth');
        $this->ownerA = $this->makeUser($this->a);
        $this->makeRegister($this->a, 'A1');
        [$this->branchB, $this->registerB] = $this->makeRegister($this->b, 'B1');
    }

    public function test_every_tenant_route_is_covered(): void
    {
        $tenantRoutes = collect(RouteFacade::getRoutes()->getRoutes())
            ->filter(fn (Route $r) => in_array('tenant', $r->gatherMiddleware(), true))
            ->map(fn (Route $r) => $r->getName())->sort()->values()->all();

        $this->assertSame(collect(self::COVERED)->sort()->values()->all(), $tenantRoutes,
            'A tenant-scoped route was added or removed: add a cross-tenant test for it.');
    }

    public function test_user_cannot_select_a_tenant_they_do_not_belong_to(): void
    {
        $this->getJson('/api/v1/branches', $this->userHeaders($this->ownerA, $this->b))
            ->assertStatus(403)->assertJsonPath('error.code', 'forbidden');
    }

    public function test_user_requests_require_a_tenant_header(): void
    {
        $this->getJson('/api/v1/branches', $this->userHeaders($this->ownerA))
            ->assertStatus(400)->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_listings_only_show_own_tenant_data(): void
    {
        $headers = $this->userHeaders($this->ownerA, $this->a);

        $branches = $this->getJson('/api/v1/branches', $headers)->assertOk()->json('data');
        $registers = $this->getJson('/api/v1/registers', $headers)->assertOk()->json('data');

        $this->assertSame(['A1'], array_column($registers, 'code'));
        $this->assertNotContains($this->branchB->id, array_column($branches, 'id'));
    }

    public function test_cannot_create_a_register_in_another_tenants_branch(): void
    {
        $this->postJson("/api/v1/branches/{$this->branchB->id}/registers", ['name' => 'X', 'code' => 'X1'], $this->userHeaders($this->ownerA, $this->a))
            ->assertStatus(404)->assertJsonPath('error.code', 'not_found');
        $this->assertSame(1, app(TenantContext::class)->run($this->b, fn () => Register::count()));
    }

    public function test_cannot_register_a_device_on_another_tenants_register(): void
    {
        $this->postJson('/api/v1/devices', [
            'register_id' => $this->registerB->id, 'name' => 'Sneaky', 'platform' => 'android',
            'public_key' => str_repeat('A', 43),
        ], $this->userHeaders($this->ownerA, $this->a))->assertStatus(404);
    }

    public function test_cannot_list_or_revoke_another_tenants_devices(): void
    {
        ['device' => $deviceB] = $this->makeDevice($this->b, $this->registerB);
        $headers = $this->userHeaders($this->ownerA, $this->a);

        $this->assertNotContains($deviceB->id, array_column($this->getJson('/api/v1/devices', $headers)->json('data'), 'id'));
        $this->deleteJson("/api/v1/devices/{$deviceB->id}", [], $headers)->assertStatus(404);
        $this->assertNull($deviceB->fresh()->revoked_at);
    }

    public function test_device_tokens_are_bound_to_their_tenant(): void
    {
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->a);
        $headers = $this->deviceHeaders($device, $secret);

        $this->getJson('/api/v1/branches', [...$headers, 'X-Tenant-Id' => $this->b->id])->assertStatus(403);
        $this->getJson('/api/v1/entitlements', $headers)->assertOk();
    }

    public function test_entitlements_are_issued_for_the_callers_tenant_only(): void
    {
        $payload = $this->getJson('/api/v1/entitlements', $this->userHeaders($this->ownerA, $this->a))->json('data.payload');
        $decoded = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

        $this->assertSame($this->a->id, $decoded['tenant_id']);
    }

    public function test_cashier_cannot_manage_structure_or_devices(): void
    {
        $cashier = $this->makeUser($this->a, Role::Cashier);
        $headers = $this->userHeaders($cashier, $this->a);

        $this->getJson('/api/v1/branches', $headers)->assertOk();
        $this->postJson('/api/v1/branches', ['name' => 'New', 'code' => 'NEW'], $headers)->assertStatus(403);
        $this->getJson('/api/v1/devices', $headers)->assertStatus(403);
    }

    public function test_suspended_business_is_locked_out(): void
    {
        $this->a->update(['status' => 'suspended']);

        $this->getJson('/api/v1/branches', $this->userHeaders($this->ownerA, $this->a))
            ->assertStatus(403)->assertJsonPath('error.message', 'This business is suspended.');
    }
}
