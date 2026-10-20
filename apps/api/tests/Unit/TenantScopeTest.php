<?php

namespace Tests\Unit;

use App\Models\Branch;
use App\Tenancy\MissingTenantContext;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

class TenantScopeTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    public function test_reading_tenant_data_without_a_tenant_fails_closed(): void
    {
        $this->expectException(MissingTenantContext::class);
        Branch::count();
    }

    public function test_queries_see_only_the_current_tenant(): void
    {
        $a = $this->makeTenant('A');
        $b = $this->makeTenant('B');
        $this->makeRegister($a);
        $this->makeRegister($b);
        $context = app(TenantContext::class);

        $this->assertSame([$a->id], $context->run($a, fn () => Branch::pluck('tenant_id')->unique()->values()->all()));
        $this->assertSame(2, $context->acrossTenants(fn () => Branch::count()));
    }

    public function test_cannot_create_rows_for_another_tenant(): void
    {
        $a = $this->makeTenant('A');
        $b = $this->makeTenant('B');

        $this->expectException(MissingTenantContext::class);
        app(TenantContext::class)->run($a, fn () => Branch::create(['tenant_id' => $b->id, 'name' => 'X', 'code' => 'X']));
    }

    public function test_tenant_of_a_row_cannot_change(): void
    {
        $a = $this->makeTenant('A');
        $b = $this->makeTenant('B');
        [$branch] = $this->makeRegister($a);

        $this->expectException(MissingTenantContext::class);
        app(TenantContext::class)->run($a, fn () => $branch->update(['tenant_id' => $b->id]));
    }

    public function test_database_rejects_a_register_pointing_at_another_tenants_branch(): void
    {
        $a = $this->makeTenant('A');
        $b = $this->makeTenant('B');
        [$branchB] = $this->makeRegister($b);

        $this->expectException(\Illuminate\Database\QueryException::class);
        // Bypass the model layer entirely: the composite foreign key must still hold.
        \DB::table('registers')->insert([
            'id' => (string) \Str::uuid7(), 'tenant_id' => $a->id, 'branch_id' => $branchB->id,
            'name' => 'X', 'code' => 'X', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
