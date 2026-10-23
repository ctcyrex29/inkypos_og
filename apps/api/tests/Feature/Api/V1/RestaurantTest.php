<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Catalogue\Catalogue;
use App\Models\Device;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use stdClass;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

/** OG-3: business type, product options, recipes deducted on sale, order details on sales. */
class RestaurantTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private Tenant $tenant;

    private User $manager;

    /** @var array<string, string> */
    private array $headers;

    private Device $device;

    /** @var array<string, string> */
    private array $deviceHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->makeTenant('Kwa Mai Tendai', 'growth');
        app(TenantContext::class)->run($this->tenant, fn () => app(Catalogue::class)->seedDefaults());
        $this->manager = $this->makeUser($this->tenant, Role::Manager);
        $this->headers = $this->userHeaders($this->manager, $this->tenant);
        ['device' => $this->device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $this->deviceHeaders = $this->deviceHeaders($this->device, $secret);
    }

    private function product(array $overrides = []): array
    {
        return $this->postJson('/api/v1/products', [
            'sku' => 'SKU-'.Str::random(6), 'name' => 'Item', 'unit_price_minor' => 100, 'tax_code' => 'VAT15', 'tax_rate_bp' => 1500, ...$overrides,
        ], $this->headers)->assertCreated()->json('data');
    }

    private function plate(): array
    {
        return $this->product([
            'name' => 'Sadza plate', 'unit_price_minor' => 300, 'track_stock' => false,
            'option_groups' => [
                ['name' => 'Relish', 'required' => true, 'multiple' => false, 'options' => [
                    ['name' => 'Beef stew', 'price_delta_minor' => 200], ['name' => 'Road-runner chicken', 'price_delta_minor' => 250],
                ]],
                ['name' => 'Vegetable', 'required' => false, 'multiple' => true, 'options' => [['name' => 'Covo', 'price_delta_minor' => 0]]],
            ],
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function feed(): array
    {
        $changes = [];
        $cursor = '';
        for ($i = 0; $i < 20; $i++) {
            $page = $this->getJson('/api/v1/sync/changes?'.http_build_query(['cursor' => $cursor]), $this->deviceHeaders)->assertOk()->json('data');
            $changes = [...$changes, ...$page['changes']];
            $cursor = $page['next_cursor'];
            if (! $page['has_more']) {
                break;
            }
        }

        return $changes;
    }

    public function test_the_business_type_reaches_tills(): void
    {
        $this->assertSame('retail', collect($this->feed())->firstWhere('entity', 'business')['data']['business_type']);
        $this->patchJson('/api/v1/business', ['business_type' => 'restaurant'], $this->headers)->assertOk()->assertJsonPath('data.business_type', 'restaurant');
        $this->patchJson('/api/v1/business', ['business_type' => 'bar'], $this->headers)->assertStatus(422);
        $this->assertSame('restaurant', collect($this->feed())->firstWhere('entity', 'business')['data']['business_type']);
        $this->getJson('/api/v1/business', $this->headers)->assertOk()->assertJsonPath('data.business_type', 'restaurant')->assertJsonPath('data.timezone', 'Africa/Harare');

        // Each business sees and changes only its own settings.
        $other = $this->makeTenant('Other');
        $b = $this->userHeaders($this->makeUser($other, Role::Manager), $other);
        $this->getJson('/api/v1/business', $b)->assertOk()->assertJsonPath('data.business_type', 'retail')->assertJsonPath('data.name', 'Other');
        $cashier = $this->userHeaders($this->makeUser($this->tenant, Role::Cashier), $this->tenant);
        $this->getJson('/api/v1/business', $cashier)->assertForbidden();
    }

    public function test_options_get_lasting_v7_ids_and_reach_tills(): void
    {
        $plate = $this->plate();
        $groups = $plate['option_groups'];
        $ids = collect($groups)->flatMap(fn ($g) => [$g['id'], ...array_column($g['options'], 'id')]);
        $this->assertCount(5, $ids->unique());
        $ids->each(fn ($id) => $this->assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-7/', $id));

        // Editing keeps existing ids (sales and recipes point at them); a non-v7 id is replaced.
        $groups[0]['options'][] = ['id' => (string) Str::uuid(), 'name' => 'Matemba', 'price_delta_minor' => 150];
        $updated = $this->patchJson("/api/v1/products/{$plate['product_id']}", ['option_groups' => $groups], $this->headers)->assertOk()->json('data');
        $this->assertSame($groups[0]['options'][0]['id'], $updated['option_groups'][0]['options'][0]['id']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-7/', $updated['option_groups'][0]['options'][2]['id']);
        $this->assertFalse($updated['track_stock']);

        $this->patchJson("/api/v1/products/{$plate['product_id']}", ['option_groups' => [['name' => 'Empty', 'required' => true, 'multiple' => false, 'options' => []]]], $this->headers)
            ->assertStatus(422);

        $fromFeed = collect($this->feed())->firstWhere('entity', 'product')['data'];
        $this->assertSame(['Relish', 'Vegetable'], array_column($fromFeed['option_groups'], 'name'));
        $this->assertArrayNotHasKey('track_stock', $fromFeed);
    }

    public function test_selling_a_dish_takes_its_ingredients_off_stock(): void
    {
        $plate = $this->plate();
        $beefOption = $plate['option_groups'][0]['options'][0];
        $chickenOption = $plate['option_groups'][0]['options'][1];
        $mealie = $this->product(['name' => 'Mealie meal', 'unit' => 'kg']);
        $beef = $this->product(['name' => 'Beef', 'unit' => 'kg']);
        $chicken = $this->product(['name' => 'Chicken pieces']);
        $this->putJson("/api/v1/products/{$plate['product_id']}/recipe", ['items' => [
            ['ingredient_id' => $mealie['product_id'], 'quantity_milli' => 250],                                  // every plate
            ['option_id' => $beefOption['id'], 'ingredient_id' => $beef['product_id'], 'quantity_milli' => 150],    // beef stew only
            ['option_id' => $chickenOption['id'], 'ingredient_id' => $chicken['product_id'], 'quantity_milli' => 2000],
        ]], $this->headers)->assertOk()->assertJsonCount(3, 'data.items');

        $this->putJson("/api/v1/products/{$plate['product_id']}/recipe", ['items' => [['ingredient_id' => $plate['product_id'], 'quantity_milli' => 1]]], $this->headers)->assertStatus(422);
        $this->putJson("/api/v1/products/{$plate['product_id']}/recipe", ['items' => [['option_id' => (string) Str::uuid7(), 'ingredient_id' => $beef['product_id'], 'quantity_milli' => 1]]], $this->headers)
            ->assertStatus(422);

        // Two beef plates on table 4.
        $sale = $this->sale($plate['product_id'], 2000, [['option_id' => $beefOption['id'], 'group' => 'Relish', 'name' => 'Beef stew', 'price_delta_minor' => 200]], 'no salt');
        $sale->payload->order = (object) ['order_number' => 17, 'service_type' => 'sit_in', 'table' => '4'];
        $ack = $this->postJson('/api/v1/sync/events', ['batch_id' => (string) Str::uuid7(), 'device_id' => $this->device->id, 'events' => [$sale]], $this->deviceHeaders)
            ->assertOk()->json('data.acknowledgements.0');
        $this->assertSame('accepted', $ack['result'], json_encode($ack));

        $used = fn (array $p) => (int) DB::table('stock_movements')->where('product_id', $p['product_id'])->where('reason', 'recipe')->sum('quantity_delta_milli');
        $this->assertSame(-500, $used($mealie));
        $this->assertSame(-300, $used($beef));
        $this->assertSame(0, $used($chicken), 'the chicken recipe applies only when chicken is chosen');

        $row = DB::table('sales')->where('id', $sale->payload->sale_id)->first();
        $this->assertSame([17, 'sit_in', '4'], [(int) $row->order_number, $row->service_type, $row->table_label]);
        $line = DB::table('sale_lines')->where('sale_id', $sale->payload->sale_id)->where('product_id', $plate['product_id'])->first();
        $this->assertSame('Beef stew', json_decode($line->options)[0]->name);
        $this->assertSame('no salt', $line->note);

        // The dish itself is not counted as stock; its ingredients are.
        $names = array_column($this->getJson('/api/v1/stock/levels', $this->headers)->assertOk()->json('data.items'), 'name');
        $this->assertNotContains('Sadza plate', $names);
        $this->assertContains('Beef', $names);
    }

    public function test_recipes_are_for_managers_of_the_same_business(): void
    {
        $plate = $this->plate();
        $cashier = $this->userHeaders($this->makeUser($this->tenant, Role::Cashier), $this->tenant);
        $this->getJson("/api/v1/products/{$plate['product_id']}/recipe", $cashier)->assertForbidden();

        $other = $this->makeTenant('Other');
        $b = $this->userHeaders($this->makeUser($other, Role::Manager), $other);
        $this->getJson("/api/v1/products/{$plate['product_id']}/recipe", $b)->assertNotFound();
        $this->putJson("/api/v1/products/{$plate['product_id']}/recipe", ['items' => []], $b)->assertNotFound();
        $theirs = app(TenantContext::class)->run($other, fn () => \App\Models\Product::create(['sku' => 'X', 'name' => 'Theirs', 'unit_price_minor' => 1, 'tax_code' => 'V', 'tax_rate_bp' => 0]));
        $this->putJson("/api/v1/products/{$plate['product_id']}/recipe", ['items' => [['ingredient_id' => $theirs->id, 'quantity_milli' => 1]]], $this->headers)->assertStatus(422);
    }

    /** The shared sale vector with its first line made into this product, with options and a note. */
    private function sale(string $productId, int $quantityMilli, array $options, string $note): stdClass
    {
        $vectors = json_decode((string) file_get_contents(dirname(__DIR__, 6).'/packages/core/test-vectors/sale-events.v1.json'));
        $event = json_decode(json_encode($vectors[0]->event));
        foreach (['tenant_id' => $this->device->tenant_id, 'branch_id' => $this->device->branch_id, 'register_id' => $this->device->register_id, 'device_id' => $this->device->id, 'actor_user_id' => $this->manager->id] as $k => $v) {
            $event->{$k} = $v;
        }
        $event->event_id = (string) Str::uuid7();
        $event->device_sequence = 1;
        $line = $event->payload->lines[0];
        $this->assertSame($quantityMilli, $line->quantity_milli, 'the vector line is two units');
        $line->product_id = $productId;
        $line->options = $options;
        $line->note = $note;
        $event->payload->stock_movements[0]->product_id = $productId;

        return $event;
    }
}
