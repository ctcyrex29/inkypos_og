<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Catalogue\Catalogue;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

/** OG-1: categories, product cost and reorder level, customers, suppliers, stock adjustments, goods received. */
class RetailDepthTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private Tenant $tenant;

    private User $manager;

    /** @var array<string, string> */
    private array $headers;

    private string $branchId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->makeTenant('Shop', 'growth');
        app(TenantContext::class)->run($this->tenant, fn () => app(Catalogue::class)->seedDefaults());
        $this->manager = $this->makeUser($this->tenant, Role::Manager);
        $this->headers = $this->userHeaders($this->manager, $this->tenant);
        $this->branchId = $this->makeRegister($this->tenant)[0]->id;
    }

    private function product(array $overrides = []): array
    {
        return $this->postJson('/api/v1/products', [
            'sku' => 'SKU-'.Str::random(6), 'name' => 'Sugar 2kg', 'unit_price_minor' => 290, 'tax_code' => 'VAT15', 'tax_rate_bp' => 1500, ...$overrides,
        ], $this->headers)->assertCreated()->json('data');
    }

    /** @return list<array<string, mixed>> */
    private function feed(array $headers): array
    {
        $changes = [];
        $cursor = '';
        for ($i = 0; $i < 20; $i++) {
            $page = $this->getJson('/api/v1/sync/changes?'.http_build_query(['cursor' => $cursor, 'limit' => 2]), $headers)->assertOk()->json('data');
            $changes = [...$changes, ...$page['changes']];
            $cursor = $page['next_cursor'];
            if (! $page['has_more']) {
                break;
            }
        }

        return $changes;
    }

    public function test_categories_reach_tills_and_products_can_be_filed_under_one(): void
    {
        $drinks = $this->postJson('/api/v1/categories', ['name' => 'Drinks', 'position' => 1], $this->headers)->assertCreated()->json('data');
        $this->postJson('/api/v1/categories', ['name' => 'Drinks'], $this->headers)->assertStatus(422);
        $cola = $this->product(['name' => 'Cola', 'category_id' => $drinks['id']]);
        $this->assertSame($drinks['id'], $cola['category_id']);

        $other = $this->makeTenant('Other');
        $foreign = app(TenantContext::class)->run($other, fn () => \App\Models\Category::create(['name' => 'Theirs']));
        $this->patchJson("/api/v1/products/{$cola['product_id']}", ['category_id' => $foreign->id], $this->headers)->assertStatus(422);

        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $changes = collect($this->feed($this->deviceHeaders($device, $secret)));
        $this->assertSame('Drinks', $changes->firstWhere('entity', 'category')['data']['name']);
        $this->assertSame($drinks['id'], $changes->firstWhere('entity', 'product')['data']['category_id']);

        $this->patchJson("/api/v1/categories/{$drinks['id']}", ['name' => 'Cold drinks'], $this->headers)->assertOk()->assertJsonPath('data.version', 2);
        $this->assertSame('category', DB::table('catalogue_changes')->orderByDesc('seq')->value('entity'));
    }

    public function test_cost_and_reorder_level_are_for_managers_only(): void
    {
        $sugar = $this->product(['cost_minor' => 210, 'reorder_level_milli' => 5000]);
        $this->assertSame([210, 5000], [$sugar['cost_minor'], $sugar['reorder_level_milli']]);

        $cashier = $this->userHeaders($this->makeUser($this->tenant, Role::Cashier), $this->tenant);
        $seen = $this->getJson('/api/v1/products', $cashier)->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('cost_minor', $seen);

        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $product = collect($this->feed($this->deviceHeaders($device, $secret)))->firstWhere('entity', 'product');
        $this->assertArrayNotHasKey('cost_minor', $product['data']);
        $this->assertArrayNotHasKey('reorder_level_milli', $product['data']);
    }

    public function test_customers_are_managed_paged_to_tills_and_recorded_on_sales(): void
    {
        $tendai = $this->postJson('/api/v1/customers', ['name' => 'Tendai Moyo', 'phone' => '+263 77 123 4567', 'email' => 't@example.test', 'notes' => 'Pays by EcoCash'], $this->headers)
            ->assertCreated()->json('data');
        $this->postJson('/api/v1/customers', ['name' => 'Bad', 'phone' => 'call me'], $this->headers)->assertStatus(422);
        foreach (['Rudo', 'Farai', 'Tatenda'] as $name) {
            $this->postJson('/api/v1/customers', ['name' => $name], $this->headers)->assertCreated();
        }
        $this->assertSame(['Tendai Moyo'], array_column($this->getJson('/api/v1/customers?search=771', $this->headers)->json('data'), 'name'));

        // Tills page through all customers after the products, without email or notes.
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $deviceHeaders = $this->deviceHeaders($device, $secret);
        $customers = collect($this->feed($deviceHeaders))->where('entity', 'customer');
        $this->assertCount(4, $customers);
        $this->assertSame(['id', 'name', 'phone', 'active', 'version'], array_keys($customers->firstWhere('id', $tendai['id'])['data']));

        // A sale naming the customer is kept against them.
        $sale = $this->saleFrom($device, ['customer_id' => $tendai['id']]);
        $this->postJson('/api/v1/sync/events', ['batch_id' => (string) Str::uuid7(), 'device_id' => $device->id, 'events' => [$sale]], $deviceHeaders)
            ->assertOk()->assertJsonPath('data.acknowledgements.0.result', 'accepted');
        $history = $this->getJson("/api/v1/customers/{$tendai['id']}", $this->headers)->assertOk()->json('data');
        $this->assertSame(1, $history['sales_count']);
        $this->assertSame($sale->payload->totals->total_minor, $history['sales_total_minor']);
        $this->assertSame($sale->payload->sale_id, $history['recent_sales'][0]['sale_id']);
        $this->assertSame(0, DB::table('sync_conflicts')->where('type', 'unknown_customer')->count());

        // A customer the business does not have is kept on the sale and flagged.
        $stranger = (string) Str::uuid7();
        $ack = $this->postJson('/api/v1/sync/events', ['batch_id' => (string) Str::uuid7(), 'device_id' => $device->id, 'events' => [$this->saleFrom($device, ['customer_id' => $stranger], 2)]], $deviceHeaders)
            ->assertOk()->json('data.acknowledgements.0');
        $this->assertSame('accepted', $ack['result']);
        $this->assertSame($stranger, json_decode(DB::table('sync_conflicts')->where('type', 'unknown_customer')->value('details'), true)['customer_id']);
    }

    public function test_stock_adjustments_follow_their_reason_and_counts_record_the_difference(): void
    {
        $sugar = $this->product(['cost_minor' => 200, 'reorder_level_milli' => 10000]);
        $adjust = fn (array $body) => $this->postJson('/api/v1/stock/adjustments', ['branch_id' => $this->branchId, 'product_id' => $sugar['product_id'], ...$body], $this->headers);

        $adjust(['reason' => 'intake', 'quantity_delta_milli' => 24000])->assertCreated()->assertJsonPath('data.on_hand_milli', 24000);
        $adjust(['reason' => 'intake', 'quantity_delta_milli' => -1000])->assertStatus(422);
        $adjust(['reason' => 'damage', 'quantity_delta_milli' => 1000])->assertStatus(422);
        $adjust(['reason' => 'damage', 'quantity_delta_milli' => -2000, 'note' => 'Torn bags'])->assertCreated()->assertJsonPath('data.on_hand_milli', 22000);
        $adjust(['reason' => 'correction', 'quantity_delta_milli' => 0])->assertStatus(422);
        $adjust(['reason' => 'count', 'quantity_delta_milli' => 5])->assertStatus(422);
        $adjust(['reason' => 'count', 'counted_milli' => 9000])->assertCreated()
            ->assertJsonPath('data.quantity_delta_milli', -13000)->assertJsonPath('data.on_hand_milli', 9000);

        $levels = $this->getJson('/api/v1/stock/levels', $this->headers)->assertOk()->json('data');
        $this->assertSame([9000, true, 1800], [$levels['items'][0]['on_hand_milli'], $levels['items'][0]['low'], $levels['items'][0]['value_minor']]);
        $this->assertSame(1800, $levels['total_value_minor']);
        $this->assertCount(1, $this->getJson('/api/v1/stock/levels?low_only=1', $this->headers)->json('data.items'));

        $ledger = $this->getJson("/api/v1/stock/movements?product_id={$sugar['product_id']}", $this->headers)->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(['intake', 'damage', 'count'], array_column($ledger, 'reason'));
        $this->assertSame(3, DB::table('audit_logs')->where('action', 'stock.adjusted')->count());
    }

    public function test_goods_received_add_stock_and_set_the_last_cost(): void
    {
        $supplier = $this->postJson('/api/v1/suppliers', ['name' => 'Harare Wholesalers', 'phone' => '0242 700 000'], $this->headers)->assertCreated()->json('data');
        $sugar = $this->product(['cost_minor' => 200]);
        $rice = $this->product(['name' => 'Rice', 'unit' => 'kg']);

        $purchase = $this->postJson('/api/v1/purchases', [
            'branch_id' => $this->branchId, 'supplier_id' => $supplier['id'], 'reference' => 'INV-3391',
            'lines' => [
                ['product_id' => $sugar['product_id'], 'quantity_milli' => 20000, 'unit_cost_minor' => 215],
                ['product_id' => $rice['product_id'], 'quantity_milli' => 12500, 'unit_cost_minor' => 133], // 16.625 → 16.63
            ],
        ], $this->headers)->assertCreated()->json('data');

        $this->assertSame(4300 + 1663, $purchase['total_cost_minor']);
        $this->assertSame('Harare Wholesalers', $purchase['supplier_name']);
        $this->assertCount(2, $purchase['lines']);
        $levels = collect($this->getJson('/api/v1/stock/levels', $this->headers)->json('data.items'))->keyBy('product_id');
        $this->assertSame([20000, 215], [$levels[$sugar['product_id']]['on_hand_milli'], $levels[$sugar['product_id']]['cost_minor']]);
        $this->assertSame(12500, $levels[$rice['product_id']]['on_hand_milli']);
        $this->assertSame('purchase', DB::table('stock_movements')->where('purchase_id', $purchase['id'])->value('reason'));

        $base = ['branch_id' => $this->branchId, 'supplier_id' => $supplier['id']];
        $line = ['product_id' => $sugar['product_id'], 'quantity_milli' => 1000, 'unit_cost_minor' => 1];
        $this->postJson('/api/v1/purchases', [...$base, 'lines' => []], $this->headers)->assertStatus(422);
        $this->postJson('/api/v1/purchases', [...$base, 'lines' => [$line, $line]], $this->headers)->assertStatus(422);
        $this->postJson('/api/v1/purchases', [...$base, 'received_at' => now()->addDay()->toIso8601String(), 'lines' => [$line]], $this->headers)->assertStatus(422);
        $this->assertCount(1, $this->getJson('/api/v1/purchases', $this->headers)->json('data'));
    }

    public function test_cashiers_and_other_businesses_are_kept_out(): void
    {
        $customer = $this->postJson('/api/v1/customers', ['name' => 'Tendai'], $this->headers)->assertCreated()->json('data');
        $cashier = $this->userHeaders($this->makeUser($this->tenant, Role::Cashier), $this->tenant);
        foreach (['/api/v1/customers', '/api/v1/suppliers', '/api/v1/stock/levels', '/api/v1/purchases'] as $path) {
            $this->getJson($path, $cashier)->assertForbidden();
        }
        $this->postJson('/api/v1/categories', ['name' => 'X'], $cashier)->assertForbidden();
        $this->getJson('/api/v1/categories', $cashier)->assertOk();

        // Everything below is business A's, probed by the owner of business B.
        $category = $this->postJson('/api/v1/categories', ['name' => 'Drinks'], $this->headers)->assertCreated()->json('data');
        $supplier = $this->postJson('/api/v1/suppliers', ['name' => 'Wholesaler'], $this->headers)->assertCreated()->json('data');
        $product = $this->product();
        $this->postJson('/api/v1/stock/adjustments', ['branch_id' => $this->branchId, 'product_id' => $product['product_id'], 'reason' => 'intake', 'quantity_delta_milli' => 1000], $this->headers)
            ->assertCreated();
        $purchase = $this->postJson('/api/v1/purchases', [
            'branch_id' => $this->branchId, 'supplier_id' => $supplier['id'], 'lines' => [['product_id' => $product['product_id'], 'quantity_milli' => 1000, 'unit_cost_minor' => 100]],
        ], $this->headers)->assertCreated()->json('data');

        $other = $this->makeTenant('Other');
        [$otherBranch] = $this->makeRegister($other, 'O1');
        $b = $this->userHeaders($this->makeUser($other, Role::Manager), $other);

        foreach (['/api/v1/categories', '/api/v1/customers', '/api/v1/suppliers', '/api/v1/purchases'] as $path) {
            $this->assertSame([], $this->getJson($path, $b)->assertOk()->json('data'), $path);
        }
        $this->assertSame([], $this->getJson('/api/v1/stock/levels', $b)->assertOk()->json('data.items'));
        $this->assertSame([], $this->getJson("/api/v1/stock/movements?product_id={$product['product_id']}", $b)->assertOk()->json('data'));

        $this->patchJson("/api/v1/categories/{$category['id']}", ['name' => 'Mine'], $b)->assertNotFound();
        $this->getJson("/api/v1/customers/{$customer['id']}", $b)->assertNotFound();
        $this->patchJson("/api/v1/customers/{$customer['id']}", ['name' => 'Mine now'], $b)->assertNotFound();
        $this->patchJson("/api/v1/suppliers/{$supplier['id']}", ['name' => 'Mine'], $b)->assertNotFound();
        $this->getJson("/api/v1/purchases/{$purchase['id']}", $b)->assertNotFound();

        // Writes in B naming A's records are refused, not applied to A.
        $this->postJson('/api/v1/stock/adjustments', ['branch_id' => $otherBranch->id, 'product_id' => $product['product_id'], 'reason' => 'intake', 'quantity_delta_milli' => 1000], $b)
            ->assertStatus(422);
        $this->postJson('/api/v1/purchases', [
            'branch_id' => $otherBranch->id, 'supplier_id' => $supplier['id'], 'lines' => [['product_id' => $product['product_id'], 'quantity_milli' => 1000, 'unit_cost_minor' => 1]],
        ], $b)->assertStatus(422);
        // Same names are fine in another business.
        $this->postJson('/api/v1/categories', ['name' => 'Drinks'], $b)->assertCreated();
        $this->postJson('/api/v1/customers', ['name' => 'Tendai'], $b)->assertCreated();
        $this->postJson('/api/v1/suppliers', ['name' => 'Wholesaler'], $b)->assertCreated();

        $this->assertSame(1000, (int) DB::table('stock_movements')->where('product_id', $product['product_id'])->where('reason', 'intake')->sum('quantity_delta_milli'));
        $this->assertSame(1, Branch::withoutGlobalScopes()->where('tenant_id', $other->id)->count());
    }

    /** A valid sale from the shared vectors for this device, with fresh ids and extra payload fields. */
    private function saleFrom(\App\Models\Device $device, array $payload = [], int $sequence = 1): object
    {
        $vectors = json_decode((string) file_get_contents(dirname(__DIR__, 6).'/packages/core/test-vectors/sale-events.v1.json'));
        $event = json_decode(json_encode($vectors[0]->event));
        foreach (['tenant_id' => $device->tenant_id, 'branch_id' => $device->branch_id, 'register_id' => $device->register_id, 'device_id' => $device->id] as $k => $v) {
            $event->{$k} = $v;
        }
        $event->event_id = (string) Str::uuid7();
        $event->device_sequence = $sequence;
        $event->payload->sale_id = $event->aggregate_id = (string) Str::uuid7();
        foreach ([...$event->payload->lines, ...$event->payload->payments, ...$event->payload->stock_movements] as $child) {
            foreach (['line_id', 'payment_id', 'movement_id'] as $key) {
                if (isset($child->{$key})) {
                    $child->{$key} = (string) Str::uuid7();
                }
            }
        }
        foreach ($payload as $k => $v) {
            $event->payload->{$k} = $v;
        }

        return $event;
    }
}
