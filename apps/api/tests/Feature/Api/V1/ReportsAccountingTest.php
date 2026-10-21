<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Catalogue\Catalogue;
use App\Models\Device;
use App\Models\Tenant;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use stdClass;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

/** OG-2: reports (sales, VAT, shifts, profit, audit) and accounting (expenses, supplier payments, cash book). */
class ReportsAccountingTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private Tenant $tenant;

    private User $manager;

    /** @var array<string, string> */
    private array $headers;

    private Device $device;

    /** @var array<string, string> */
    private array $deviceHeaders;

    private stdClass $vectors;

    private string $shiftId;

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();
        // The recorded day is 21–22 October; "now" is after it so nothing counts as future-dated.
        Carbon::setTestNow('2026-10-23T12:00:00Z');
        $this->tenant = $this->makeTenant('Shop', 'growth');
        app(TenantContext::class)->run($this->tenant, fn () => app(Catalogue::class)->seedDefaults());
        $this->manager = $this->makeUser($this->tenant, Role::Manager);
        $this->headers = $this->userHeaders($this->manager, $this->tenant);
        ['device' => $this->device, 'secret' => $secret] = $this->makeDevice($this->tenant);
        $this->deviceHeaders = $this->deviceHeaders($this->device, $secret);
        $this->vectors = json_decode((string) file_get_contents(dirname(__DIR__, 6).'/packages/core/test-vectors/refund-events.v1.json'));
        $this->recordADay();
    }

    private function event(string $type, string $aggregate, array|stdClass $payload, string $occurredAt): array
    {
        return [
            'schema_version' => 1, 'event_id' => (string) Str::uuid7(), 'event_type' => $type, 'device_sequence' => ++$this->sequence,
            'occurred_at' => $occurredAt, 'tenant_id' => $this->device->tenant_id, 'branch_id' => $this->device->branch_id,
            'register_id' => $this->device->register_id, 'device_id' => $this->device->id, 'actor_user_id' => $this->manager->id,
            'aggregate_id' => $aggregate, 'payload' => $payload,
        ];
    }

    private function push(array $event): void
    {
        $ack = $this->postJson('/api/v1/sync/events', ['batch_id' => (string) Str::uuid7(), 'device_id' => $this->device->id, 'events' => [$event]], $this->deviceHeaders)
            ->assertOk()->json('data.acknowledgements.0');
        $this->assertSame('accepted', $ack['result'], json_encode($ack));
    }

    /**
     * A shift on 21 October (Harare): opened, one sale just after local midnight,
     * a cash expense, closed 0.50 short; the next day one bread is refunded.
     */
    private function recordADay(): void
    {
        $sale = json_decode(json_encode($this->vectors->sale));
        $this->shiftId = (string) Str::uuid7();
        $this->push($this->event('shift.opened', $this->shiftId, ['shift_id' => $this->shiftId, 'opened_at' => '2026-10-21T00:05:00+02:00', 'opening_float' => [['currency' => 'USD', 'amount_minor' => 2000]]], '2026-10-21T00:05:00+02:00'));
        $sale->completed_at = '2026-10-21T00:30:00+02:00'; // 20 October in UTC
        $sale->shift_id = $this->shiftId;
        $this->push($this->event('sale.completed', $sale->sale_id, $sale, $sale->completed_at));
        $moveId = (string) Str::uuid7();
        $this->push($this->event('cash.movement', $moveId, [
            'movement_id' => $moveId, 'shift_id' => $this->shiftId, 'direction' => 'out', 'currency' => 'USD', 'amount_minor' => 300, 'reason' => 'expense',
            'note' => 'Airtime', 'occurred_at' => '2026-10-21T10:00:00+02:00',
        ], '2026-10-21T10:00:00+02:00'));
        $this->push($this->event('shift.closed', $this->shiftId, [
            'shift_id' => $this->shiftId, 'closed_at' => '2026-10-21T18:00:00+02:00',
            'expected_cash' => [['currency' => 'USD', 'amount_minor' => 5000]], 'counted_cash' => [['currency' => 'USD', 'amount_minor' => 4950]],
        ], '2026-10-21T18:00:00+02:00'));
        $refund = collect($this->vectors->cases)->firstWhere('name', 'one of two breads')->event->payload; // refunded 22 Oct, 11:00 Harare
        $this->push($this->event('refund.issued', $refund->refund_id, $refund, $refund->refunded_at));
    }

    private function report(string $path, array $query = [], ?array $headers = null): array
    {
        return $this->getJson($path.'?'.http_build_query($query), $headers ?? $this->headers)->assertOk()->json('data');
    }

    public function test_sales_are_grouped_by_the_business_local_day(): void
    {
        $sale = $this->vectors->sale;
        $refund = collect($this->vectors->cases)->firstWhere('name', 'one of two breads')->event->payload;
        $report = $this->report('/api/v1/reports/sales', ['from' => '2026-10-20', 'to' => '2026-10-22']);

        $this->assertSame('Africa/Harare', $report['timezone']);
        $this->assertSame([0, 1, 0], array_column($report['days'], 'sales_count'));
        $this->assertSame([0, 0, 1], array_column($report['days'], 'refunds_count'));
        $this->assertSame($sale->totals->total_minor - $refund->totals->total_minor, $report['totals']['net_minor']);
        $this->assertSame($this->manager->name, $report['by_cashier'][0]['name']);
        $this->assertNotEmpty($report['top_products']);
        $cash = collect($report['payments'])->firstWhere('method_code', 'cash');
        $this->assertSame($refund->totals->total_minor, $cash['refunded_minor']);

        // Grouped by UTC instead, the sale moves to the 20th.
        $this->patchJson('/api/v1/business', ['timezone' => 'UTC'], $this->headers)->assertOk();
        $this->patchJson('/api/v1/business', ['timezone' => 'Mars/Olympus'], $this->headers)->assertStatus(422);
        $this->assertSame([1, 0, 0], array_column($this->report('/api/v1/reports/sales', ['from' => '2026-10-20', 'to' => '2026-10-22'])['days'], 'sales_count'));

        $this->getJson('/api/v1/reports/sales?from=2026-01-01&to=2026-12-31', $this->headers)->assertStatus(422);
        $this->getJson('/api/v1/reports/sales?from=2026-10-22&to=2026-10-21', $this->headers)->assertStatus(422);
    }

    public function test_vat_nets_refunds_off_the_tax_they_reverse(): void
    {
        $sale = $this->vectors->sale;
        $refund = collect($this->vectors->cases)->firstWhere('name', 'one of two breads')->event->payload;
        $vat = $this->report('/api/v1/reports/vat', ['from' => '2026-10-21', 'to' => '2026-10-22']);

        $this->assertSame($sale->totals->tax_minor - $refund->totals->tax_minor, $vat['net_tax_minor']);
        $this->assertSame(
            ($sale->totals->total_minor - $sale->totals->tax_minor) - ($refund->totals->total_minor - $refund->totals->tax_minor),
            $vat['net_taxable_minor'],
        );
        $this->assertStringContainsString('Not a tax return', $vat['notice']);
    }

    public function test_shift_reports_show_takings_movements_and_the_count(): void
    {
        $list = $this->report('/api/v1/reports/shifts', ['from' => '2026-10-21', 'to' => '2026-10-21']);
        $this->assertCount(1, $list);
        $this->assertSame([['currency' => 'USD', 'amount_minor' => -50]], $list[0]['variance']);

        $z = $this->report("/api/v1/reports/shifts/{$this->shiftId}");
        $this->assertSame(1, $z['sales_count']);
        $this->assertSame($this->vectors->sale->totals->total_minor, $z['sales_minor']);
        $this->assertSame('expense', $z['cash_movements'][0]['reason']);
        $this->assertSame([['currency' => 'USD', 'amount_minor' => 4950]], $z['counted_cash']);
        $this->assertSame($this->manager->name, $z['opened_by']);
        $this->getJson('/api/v1/reports/shifts/'.Str::uuid7(), $this->headers)->assertNotFound();
    }

    public function test_profit_is_an_estimate_from_last_cost_and_lists_what_it_cannot_cost(): void
    {
        $bread = $this->vectors->sale->lines[0]; // 2 sold, 1 returned to stock
        DB::table('products')->insert([
            'id' => $bread->product_id, 'tenant_id' => $this->tenant->id, 'sku' => 'BREAD', 'name' => $bread->name, 'unit_price_minor' => $bread->unit_price_minor,
            'unit' => 'each', 'tax_code' => 'VAT15', 'tax_rate_bp' => 1500, 'tax_inclusive' => true, 'active' => true, 'version' => 1, 'cost_minor' => 90,
        ]);
        $this->postJson('/api/v1/expenses', ['category' => 'rent', 'description' => 'October rent', 'currency' => 'USD', 'amount_minor' => 1000, 'paid_from' => 'bank', 'spent_at' => '2026-10-21T12:00:00+02:00'], $this->headers)
            ->assertCreated();

        $p = $this->report('/api/v1/reports/profit', ['from' => '2026-10-21', 'to' => '2026-10-22']);
        $this->assertSame(90 * 2 - 90, $p['cost_of_goods_minor']);
        $this->assertSame(1000 + 300, $p['expenses_minor'], 'back-office rent plus the till cash expense');
        $this->assertSame($p['net_sales_minor'] - $p['cost_of_goods_minor'] - $p['expenses_minor'], $p['net_profit_minor']);
        $this->assertSame(count($this->vectors->sale->lines) - 1, $p['uncosted_lines']);
        $this->assertStringContainsString('Estimate', $p['notice']);
    }

    public function test_expenses_supplier_payments_and_the_cash_book(): void
    {
        $supplier = $this->postJson('/api/v1/suppliers', ['name' => 'Harare Bakeries'], $this->headers)->assertCreated()->json('data');
        $branchId = DB::table('branches')->where('tenant_id', $this->tenant->id)->value('id');
        $product = $this->postJson('/api/v1/products', ['sku' => 'FLOUR', 'name' => 'Flour', 'unit_price_minor' => 500, 'tax_code' => 'VAT15', 'tax_rate_bp' => 1500], $this->headers)->json('data');
        $this->postJson('/api/v1/purchases', ['branch_id' => $branchId, 'supplier_id' => $supplier['id'], 'lines' => [['product_id' => $product['product_id'], 'quantity_milli' => 10000, 'unit_cost_minor' => 400]]], $this->headers)
            ->assertCreated();
        $this->postJson('/api/v1/supplier-payments', ['supplier_id' => $supplier['id'], 'currency' => 'USD', 'amount_minor' => 2500, 'paid_from' => 'bank', 'reference' => 'ZIPIT 77', 'paid_at' => '2026-10-22T09:00:00+02:00'], $this->headers)
            ->assertCreated();
        $this->postJson('/api/v1/supplier-payments', ['supplier_id' => $supplier['id'], 'currency' => 'ZWG', 'amount_minor' => 10000, 'paid_from' => 'mobile_money'], $this->headers)->assertCreated();
        $this->postJson('/api/v1/supplier-payments', ['supplier_id' => $supplier['id'], 'currency' => 'USD', 'amount_minor' => 0, 'paid_from' => 'bank'], $this->headers)->assertStatus(422);
        $this->postJson('/api/v1/expenses', ['category' => 'gifts', 'description' => 'x', 'currency' => 'USD', 'amount_minor' => 1, 'paid_from' => 'bank'], $this->headers)->assertStatus(422);
        $this->postJson('/api/v1/expenses', ['category' => 'fees', 'description' => 'x', 'currency' => 'USD', 'amount_minor' => 1, 'paid_from' => 'bank', 'spent_at' => now()->addDay()->toIso8601String()], $this->headers)
            ->assertStatus(422);

        $balances = $this->report('/api/v1/supplier-balances');
        $row = collect($balances['suppliers'])->firstWhere('name', 'Harare Bakeries');
        $this->assertSame([4000, 2500, 1500], [$row['deliveries_minor'], $row['paid_minor'], $row['balance_minor']]);
        $this->assertSame([['currency' => 'ZWG', 'amount_minor' => 10000]], $row['paid_in_other_currencies']);

        $book = $this->report('/api/v1/cashbook', ['from' => '2026-10-21', 'to' => '2026-10-22']);
        $kinds = array_column($book['entries'], 'kind');
        foreach (['takings', 'refund', 'drawer', 'supplier'] as $kind) {
            $this->assertContains($kind, $kinds);
        }
        $usd = collect($book['totals'])->firstWhere('currency', 'USD');
        $this->assertSame($usd['in_minor'] - $usd['out_minor'], $usd['net_minor']);
        $this->assertSame(2500 + 300, (int) collect($book['entries'])->whereIn('kind', ['supplier', 'drawer'])->where('currency', 'USD')->sum('out_minor'));
    }

    public function test_the_audit_log_shows_back_office_actions_newest_first(): void
    {
        $this->postJson('/api/v1/expenses', ['category' => 'fees', 'description' => 'Bank fees', 'currency' => 'USD', 'amount_minor' => 150, 'paid_from' => 'bank'], $this->headers)->assertCreated();
        $log = $this->report('/api/v1/audit', ['action' => 'expense.']);
        $this->assertSame('expense.recorded', $log[0]['action']);
        $this->assertSame($this->manager->name, $log[0]['actor']);
        $this->assertSame(150, $log[0]['metadata']['amount_minor']);
    }

    public function test_cashiers_and_other_businesses_see_nothing(): void
    {
        $cashier = $this->userHeaders($this->makeUser($this->tenant, Role::Cashier), $this->tenant);
        foreach (['/api/v1/reports/sales', '/api/v1/reports/vat', '/api/v1/reports/profit', '/api/v1/reports/shifts', '/api/v1/cashbook', '/api/v1/expenses'] as $path) {
            $this->getJson($path.'?from=2026-10-21&to=2026-10-22', $cashier)->assertForbidden();
        }
        $this->getJson('/api/v1/audit', $cashier)->assertForbidden();
        $this->getJson('/api/v1/supplier-balances', $cashier)->assertForbidden();
        $this->patchJson('/api/v1/business', ['timezone' => 'UTC'], $cashier)->assertForbidden();
        $this->postJson('/api/v1/expenses', [], $cashier)->assertForbidden();
        $this->postJson('/api/v1/supplier-payments', [], $cashier)->assertForbidden();
        $this->getJson("/api/v1/reports/shifts/{$this->shiftId}", $this->deviceHeaders)->assertForbidden();

        // Another business's owner gets empty reports and cannot reach this one's records.
        $this->postJson('/api/v1/expenses', ['category' => 'fees', 'description' => 'Ours', 'currency' => 'USD', 'amount_minor' => 150, 'paid_from' => 'bank', 'spent_at' => '2026-10-21T12:00:00+02:00'], $this->headers)
            ->assertCreated();
        $supplier = $this->postJson('/api/v1/suppliers', ['name' => 'Ours'], $this->headers)->json('data');
        $other = $this->makeTenant('Other');
        $b = $this->userHeaders($this->makeUser($other, Role::Owner), $other);
        $range = ['from' => '2026-10-20', 'to' => '2026-10-22'];
        $this->assertSame(0, $this->report('/api/v1/reports/sales', $range, $b)['totals']['sales_count']);
        $this->assertSame([], $this->report('/api/v1/reports/vat', $range, $b)['lines']);
        $this->assertSame(0, $this->report('/api/v1/reports/profit', $range, $b)['expenses_minor']);
        $this->assertSame([], $this->report('/api/v1/reports/shifts', $range, $b));
        $this->getJson("/api/v1/reports/shifts/{$this->shiftId}", $b)->assertNotFound();
        $this->assertSame([], $this->report('/api/v1/cashbook', $range, $b)['entries']);
        $this->assertSame([], $this->report('/api/v1/expenses', $range, $b));
        $this->assertSame([], $this->report('/api/v1/supplier-balances', [], $b)['suppliers']);
        $this->assertSame([], array_filter($this->report('/api/v1/audit', [], $b), fn ($r) => str_starts_with($r['action'], 'expense.')));
        $this->postJson('/api/v1/supplier-payments', ['supplier_id' => $supplier['id'], 'currency' => 'USD', 'amount_minor' => 100, 'paid_from' => 'bank'], $b)->assertStatus(422);
        $this->patchJson('/api/v1/business', ['timezone' => 'UTC'], $b)->assertOk();
        $this->assertSame('Africa/Harare', $this->tenant->refresh()->timezone);
        $this->postJson('/api/v1/expenses', ['category' => 'fees', 'description' => 'Theirs', 'currency' => 'USD', 'amount_minor' => 1, 'paid_from' => 'bank'], $b)->assertCreated();
        $this->assertSame(1, DB::table('expenses')->where('tenant_id', $this->tenant->id)->count());
    }
}
