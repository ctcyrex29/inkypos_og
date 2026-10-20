<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Catalogue\Catalogue;
use App\Models\PaymentMethod;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

class CatalogueTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private Tenant $tenant;

    private User $manager;

    /** @var array<string, string> */
    private array $headers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->makeTenant('Shop', 'growth');
        app(TenantContext::class)->run($this->tenant, fn () => app(Catalogue::class)->seedDefaults());
        $this->manager = $this->makeUser($this->tenant, Role::Manager);
        $this->headers = $this->userHeaders($this->manager, $this->tenant);
    }

    private function product(array $overrides = []): array
    {
        return $this->postJson('/api/v1/products', [
            'sku' => 'SKU-'.Str::random(6), 'name' => 'Bread', 'unit_price_minor' => 120, 'tax_code' => 'VAT15',
            'tax_rate_bp' => 1500, 'barcodes' => ['2000000000015'], ...$overrides,
        ], $this->headers)->assertCreated()->json('data');
    }

    /** Pulls every page of the feed from a cursor. @return array{0: list<array>, 1: string} */
    private function pullAll(array $headers, string $cursor = '', int $limit = 200): array
    {
        $changes = [];
        for ($i = 0; $i < 50; $i++) {
            $page = $this->getJson('/api/v1/sync/changes?'.http_build_query(['cursor' => $cursor, 'limit' => $limit]), $headers)->assertOk()->json('data');
            $changes = [...$changes, ...$page['changes']];
            $cursor = $page['next_cursor'];
            if (! $page['has_more']) {
                break;
            }
        }

        return [$changes, $cursor];
    }

    public function test_signup_seeds_the_four_default_payment_types(): void
    {
        $session = $this->postJson('/api/v1/auth/signup', [
            'business_name' => 'New Shop', 'name' => 'Owner', 'email' => 'owner@new.test', 'password' => 'long enough password', 'device_name' => 'x',
        ])->assertCreated()->json('data');
        $headers = ['Authorization' => 'Bearer '.$session['tokens']['access_token'], 'X-Tenant-Id' => $session['memberships'][0]['tenant_id']];

        $methods = $this->getJson('/api/v1/payment-methods', $headers)->assertOk()->json('data');

        $this->assertSame(['cash', 'ecocash', 'card', 'transfer'], array_column($methods, 'code'));
        $this->assertSame(['recorded', 'pending_confirmation', 'recorded', 'pending_confirmation'], array_column($methods, 'initial_status'));
        $this->assertSame([true, false, false, false], array_column($methods, 'gives_change'));
    }

    public function test_manager_creates_and_updates_products_with_versioned_changes(): void
    {
        $p = $this->product(['name' => 'White bread 700g']);
        $this->assertSame(1, $p['version']);
        $this->assertSame(['2000000000015'], $p['barcodes']);

        $updated = $this->patchJson("/api/v1/products/{$p['product_id']}", ['unit_price_minor' => 130, 'barcodes' => ['2000000000015', '2000000000999']], $this->headers)
            ->assertOk()->json('data');

        $this->assertSame([130, 2], [$updated['unit_price_minor'], $updated['version']]);
        $this->assertSame(['2000000000015', '2000000000999'], $updated['barcodes']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'product.updated', 'subject_id' => $p['product_id']]);
    }

    public function test_barcodes_and_skus_are_unique_within_a_business(): void
    {
        $this->product(['sku' => 'BREAD']);
        $this->postJson('/api/v1/products', ['sku' => 'BREAD', 'name' => 'x', 'unit_price_minor' => 1, 'tax_code' => 'Z', 'tax_rate_bp' => 0], $this->headers)
            ->assertStatus(422);
        $this->postJson('/api/v1/products', ['sku' => 'OTHER', 'name' => 'x', 'unit_price_minor' => 1, 'tax_code' => 'Z', 'tax_rate_bp' => 0, 'barcodes' => ['2000000000015']], $this->headers)
            ->assertStatus(422)->assertJsonPath('error.message', 'Barcode already used by another product: 2000000000015');
    }

    public function test_cashiers_and_devices_cannot_edit_the_catalogue(): void
    {
        $cashier = $this->makeUser($this->tenant, Role::Cashier);
        $body = ['sku' => 'X', 'name' => 'x', 'unit_price_minor' => 1, 'tax_code' => 'Z', 'tax_rate_bp' => 0];
        $this->postJson('/api/v1/products', $body, $this->userHeaders($cashier, $this->tenant))->assertStatus(403);

        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $this->postJson('/api/v1/products', $body, $this->deviceHeaders($device, $secret))->assertStatus(403);
        $this->getJson('/api/v1/products', $this->deviceHeaders($device, $secret))->assertOk();
    }

    public function test_feed_starts_with_a_snapshot_then_follows_the_log(): void
    {
        $this->makeRegister($this->tenant, 'T1');
        $bread = $this->product(['name' => 'Bread']);
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $headers = $this->deviceHeaders($device, $secret);

        [$changes, $cursor] = $this->pullAll($headers);
        $entities = array_count_values(array_column($changes, 'entity'));
        $this->assertSame(1, $entities['business']);
        $this->assertSame(4, $entities['payment_method']);
        $this->assertSame(1, $entities['product']);
        $this->assertGreaterThanOrEqual(1, $entities['register']);
        $this->assertStringStartsWith('log:', $cursor);

        // Nothing new: an empty page.
        [$none] = $this->pullAll($headers, $cursor);
        $this->assertSame([], $none);

        $this->patchJson("/api/v1/products/{$bread['product_id']}", ['unit_price_minor' => 150], $this->headers)->assertOk();
        $this->patchJson("/api/v1/products/{$bread['product_id']}", ['active' => false], $this->headers)->assertOk();
        [$after] = $this->pullAll($headers, $cursor);

        $this->assertCount(1, $after, 'two edits collapse into the current state');
        $this->assertSame(['product', 'upsert', 3, 150, false], [
            $after[0]['entity'], $after[0]['op'], $after[0]['version'], $after[0]['data']['unit_price_minor'], $after[0]['data']['active'],
        ]);
    }

    public function test_snapshot_pages_through_large_catalogues_without_losing_concurrent_edits(): void
    {
        $ids = [];
        for ($i = 0; $i < 5; $i++) {
            $ids[] = $this->product(['barcodes' => ['20000000001'.$i.'0']])['product_id'];
        }
        $page = $this->getJson('/api/v1/sync/changes?limit=2', $this->headers)->assertOk()->json('data');
        $this->assertStringStartsWith('snap:', $page['next_cursor']);

        // A product edited mid-snapshot is caught by the log afterwards.
        $this->patchJson("/api/v1/products/{$ids[0]}", ['name' => 'Edited'], $this->headers)->assertOk();
        [$rest] = $this->pullAll($this->headers, $page['next_cursor'], 2);
        $all = [...$page['changes'], ...$rest];

        $products = array_filter($all, fn ($c) => $c['entity'] === 'product');
        $this->assertEqualsCanonicalizing($ids, array_values(array_unique(array_column($products, 'id'))));
        $last = array_values(array_filter($products, fn ($c) => $c['id'] === $ids[0]));
        $this->assertSame('Edited', end($last)['data']['name']);
    }

    public function test_rejects_an_unknown_cursor(): void
    {
        $this->getJson('/api/v1/sync/changes?cursor=garbage', $this->headers)->assertStatus(422);
    }

    public function test_exchange_rates_are_versioned_and_validated(): void
    {
        $this->postJson('/api/v1/exchange-rates', ['quote_currency' => 'ZWG', 'rate' => '0.03703704'], $this->headers)->assertCreated()->assertJsonPath('data.version', 1);
        $this->postJson('/api/v1/exchange-rates', ['quote_currency' => 'ZWG', 'rate' => '0.0365'], $this->headers)->assertCreated()->assertJsonPath('data.version', 2);

        $this->postJson('/api/v1/exchange-rates', ['quote_currency' => 'USD', 'rate' => '1'], $this->headers)->assertStatus(422);
        $this->postJson('/api/v1/exchange-rates', ['quote_currency' => 'ZWG', 'rate' => '0.000'], $this->headers)->assertStatus(422);
        $this->postJson('/api/v1/exchange-rates', ['quote_currency' => 'ZWG', 'rate' => '1e5'], $this->headers)->assertStatus(422);

        [$changes] = $this->pullAll($this->headers);
        $rates = array_values(array_filter($changes, fn ($c) => $c['entity'] === 'exchange_rate'));
        $this->assertSame(['0.0365'], array_column(array_column($rates, 'data'), 'rate'), 'snapshot carries only the latest rate');
    }

    public function test_payment_methods_can_be_switched_off(): void
    {
        $ecocash = app(TenantContext::class)->run($this->tenant, fn () => PaymentMethod::where('code', 'ecocash')->first());

        $this->patchJson("/api/v1/payment-methods/{$ecocash->id}", ['active' => false], $this->headers)
            ->assertOk()->assertJsonPath('data.active', false)->assertJsonPath('data.version', 2);
    }

    public function test_stock_is_derived_from_sales_and_adjustments(): void
    {
        $bread = $this->product();
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $deviceHeaders = $this->deviceHeaders($device, $secret);
        $adjustment = [
            'schema_version' => 1, 'event_id' => (string) Str::uuid7(), 'event_type' => 'stock.adjusted', 'device_sequence' => 1,
            'occurred_at' => now()->toIso8601String(), 'tenant_id' => $device->tenant_id, 'branch_id' => $device->branch_id,
            'register_id' => $device->register_id, 'device_id' => $device->id, 'actor_user_id' => $this->manager->id,
            'aggregate_id' => $adjId = (string) Str::uuid7(),
            'payload' => ['adjustment_id' => $adjId, 'product_id' => $bread['product_id'], 'quantity_delta_milli' => 24000, 'reason' => 'received'],
        ];
        $ack = $this->postJson('/api/v1/sync/events', ['batch_id' => (string) Str::uuid7(), 'device_id' => $device->id, 'events' => [$adjustment]], $deviceHeaders)
            ->assertOk()->json('data.acknowledgements.0');
        $this->assertSame('accepted', $ack['result']);

        $stock = collect($this->getJson('/api/v1/stock', $this->headers)->assertOk()->json('data'))->keyBy('product_id');
        $this->assertSame(24000, $stock[$bread['product_id']]['on_hand_milli']);
        $this->assertSame(0, DB::table('sync_conflicts')->count(), 'a known product raises no conflict');
    }

    public function test_sales_of_unknown_products_are_kept_and_flagged(): void
    {
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $vectors = json_decode((string) file_get_contents(dirname(__DIR__, 6).'/packages/core/test-vectors/sale-events.v1.json'));
        $event = json_decode(json_encode($vectors[0]->event));
        foreach (['tenant_id' => $device->tenant_id, 'branch_id' => $device->branch_id, 'register_id' => $device->register_id, 'device_id' => $device->id] as $k => $v) {
            $event->{$k} = $v;
        }

        $ack = $this->postJson('/api/v1/sync/events', ['batch_id' => (string) Str::uuid7(), 'device_id' => $device->id, 'events' => [$event]], $this->deviceHeaders($device, $secret))
            ->assertOk()->json('data.acknowledgements.0');

        $this->assertSame('accepted', $ack['result']);
        $conflict = DB::table('sync_conflicts')->where('type', 'unknown_product')->first();
        $this->assertCount(3, json_decode($conflict->details, true)['product_ids']);
    }

    public function test_cross_tenant_catalogue_access_is_refused(): void
    {
        $other = $this->makeTenant('Other', 'growth');
        app(TenantContext::class)->run($other, fn () => app(Catalogue::class)->seedDefaults());
        $otherHeaders = $this->userHeaders($this->makeUser($other, Role::Owner), $other);
        $theirs = $this->postJson('/api/v1/products', ['sku' => 'THEIRS', 'name' => 'x', 'unit_price_minor' => 1, 'tax_code' => 'Z', 'tax_rate_bp' => 0, 'barcodes' => ['2000000000015']], $otherHeaders)
            ->assertCreated()->json('data');
        $theirMethod = app(TenantContext::class)->run($other, fn () => PaymentMethod::first());

        $this->patchJson("/api/v1/products/{$theirs['product_id']}", ['name' => 'hijacked'], $this->headers)->assertStatus(404);
        $this->patchJson("/api/v1/payment-methods/{$theirMethod->id}", ['active' => false], $this->headers)->assertStatus(404);
        $this->assertNotContains($theirs['product_id'], array_column($this->getJson('/api/v1/products', $this->headers)->json('data'), 'product_id'));
        [$feed] = $this->pullAll($this->headers);
        $this->assertNotContains($theirs['product_id'], array_column($feed, 'id'));
        $this->assertNotContains($other->id, array_column($feed, 'id'));
        // Same barcode in another business is fine.
        $this->product(['sku' => 'MINE']);
    }

    public function test_demo_catalogue_command_fills_a_business(): void
    {
        $owner = $this->makeUser($this->tenant, Role::Owner);

        $this->artisan('inkypos:demo-catalogue', ['email' => $owner->email])->assertSuccessful();
        $this->artisan('inkypos:demo-catalogue', ['email' => $owner->email])->assertSuccessful(); // idempotent

        $products = $this->getJson('/api/v1/products', $this->headers)->json('data');
        $this->assertCount(12, $products);
        $this->assertSame('0.03703704', $this->getJson('/api/v1/exchange-rates', $this->headers)->json('data.0.rate'));
    }
}
