<?php

namespace Tests\Feature\Api\V1;

use App\Models\Device;
use App\Sync\EventValidator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use stdClass;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

class RefundShiftSyncTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private Device $device;

    /** @var array<string, string> */
    private array $headers;

    protected function setUp(): void
    {
        parent::setUp();
        $tenant = $this->makeTenant();
        ['device' => $this->device, 'secret' => $secret] = $this->makeDevice($tenant);
        $this->headers = $this->deviceHeaders($this->device, $secret);
    }

    private static function vectors(): stdClass
    {
        return json_decode((string) file_get_contents(dirname(__DIR__, 6).'/packages/core/test-vectors/refund-events.v1.json'));
    }

    /** Vector events carry fixed identities; make them this device's. */
    private function own(stdClass $event, int $sequence): stdClass
    {
        $event = json_decode(json_encode($event));
        $event->device_sequence = $sequence;
        foreach (['tenant_id' => $this->device->tenant_id, 'branch_id' => $this->device->branch_id, 'register_id' => $this->device->register_id, 'device_id' => $this->device->id] as $k => $v) {
            $event->{$k} = $v;
        }

        return $event;
    }

    private function push(array $events): TestResponse
    {
        return $this->postJson('/api/v1/sync/events', ['batch_id' => (string) Str::uuid7(), 'device_id' => $this->device->id, 'events' => $events], $this->headers)->assertOk();
    }

    private function envelope(string $type, string $aggregate, array $payload, int $sequence): array
    {
        return [
            'schema_version' => 1, 'event_id' => (string) Str::uuid7(), 'event_type' => $type, 'device_sequence' => $sequence,
            'occurred_at' => now()->toIso8601String(), 'tenant_id' => $this->device->tenant_id, 'branch_id' => $this->device->branch_id,
            'register_id' => $this->device->register_id, 'device_id' => $this->device->id, 'actor_user_id' => $this->device->id,
            'aggregate_id' => $aggregate, 'payload' => $payload,
        ];
    }

    public static function refundCases(): iterable
    {
        foreach (self::vectors()->cases as $case) {
            yield $case->name => [$case->name];
        }
    }

    #[DataProvider('refundCases')]
    public function test_refund_vectors_get_the_expected_outcome(string $name): void
    {
        $vectors = self::vectors();
        $case = collect($vectors->cases)->firstWhere('name', $name);

        $this->assertSame($case->schema_valid, app(EventValidator::class)->validate($case->event) === [], 'schema verdict matches TypeScript');

        // The original sale, then any earlier refunds, then the refund under test.
        $sale = (object) [
            'schema_version' => 1, 'event_id' => (string) Str::uuid7(), 'event_type' => 'sale.completed', 'occurred_at' => $vectors->sale->completed_at,
            'actor_user_id' => $this->device->id, 'aggregate_id' => $vectors->sale->sale_id, 'payload' => $vectors->sale,
        ];
        $this->assertSame('accepted', $this->push([$this->own($sale, 1)])->json('data.acknowledgements.0.result'));
        $sequence = 2;
        foreach ($case->previous as $previous) {
            $earlier = (object) [
                'schema_version' => 1, 'event_id' => (string) Str::uuid7(), 'event_type' => 'refund.issued', 'occurred_at' => $previous->refunded_at,
                'actor_user_id' => $this->device->id, 'aggregate_id' => $previous->refund_id, 'payload' => $previous,
            ];
            $this->assertSame('accepted', $this->push([$this->own($earlier, $sequence++)])->json('data.acknowledgements.0.result'));
        }

        $ack = $this->push([$this->own($case->event, $sequence)])->json('data.acknowledgements.0');

        $this->assertSame($case->expected, $ack['result'], json_encode($ack));
        $projected = DB::table('refunds')->where('id', $case->event->payload->refund_id)->exists();
        $this->assertSame($case->expected === 'accepted', $projected, 'only accepted refunds are projected');
    }

    public function test_an_accepted_refund_restocks_and_records_the_payout(): void
    {
        $vectors = self::vectors();
        $sale = (object) [
            'schema_version' => 1, 'event_id' => (string) Str::uuid7(), 'event_type' => 'sale.completed', 'occurred_at' => $vectors->sale->completed_at,
            'actor_user_id' => $this->device->id, 'aggregate_id' => $vectors->sale->sale_id, 'payload' => $vectors->sale,
        ];
        $refund = collect($vectors->cases)->firstWhere('name', 'one of two breads')->event;
        $this->push([$this->own($sale, 1), $this->own($refund, 2)]);

        $productId = $vectors->sale->lines[0]->product_id;
        $this->assertSame(-1000, (int) DB::table('stock_movements')->where('product_id', $productId)->sum('quantity_delta_milli'));
        $this->assertSame((int) $refund->payload->totals->total_minor, (int) DB::table('refund_payments')->where('refund_id', $refund->payload->refund_id)->sum('amount_minor'));
    }

    public function test_a_refund_for_a_sale_the_server_has_not_seen_is_kept_for_review(): void
    {
        $refund = collect(self::vectors()->cases)->firstWhere('name', 'one of two breads')->event;

        $ack = $this->push([$this->own($refund, 1)])->json('data.acknowledgements.0');

        $this->assertSame('conflict', $ack['result']);
        $this->assertSame('refund_original_unknown', DB::table('sync_conflicts')->where('id', $ack['conflict_id'])->value('type'));
    }

    public function test_a_shift_records_its_float_movements_and_count(): void
    {
        $shiftId = (string) Str::uuid7();
        $moveId = (string) Str::uuid7();
        $acks = $this->push([
            $this->envelope('shift.opened', $shiftId, ['shift_id' => $shiftId, 'opened_at' => now()->toIso8601String(), 'opening_float' => [['currency' => 'USD', 'amount_minor' => 5000]]], 1),
            $this->envelope('cash.movement', $moveId, ['movement_id' => $moveId, 'shift_id' => $shiftId, 'direction' => 'out', 'currency' => 'USD', 'amount_minor' => 2000, 'reason' => 'safe_drop', 'occurred_at' => now()->toIso8601String()], 2),
            $this->envelope('shift.closed', $shiftId, ['shift_id' => $shiftId, 'closed_at' => now()->toIso8601String(), 'expected_cash' => [['currency' => 'USD', 'amount_minor' => 3000]], 'counted_cash' => [['currency' => 'USD', 'amount_minor' => 2950]], 'note' => '50c short'], 3),
        ])->json('data.acknowledgements');

        $this->assertSame(['accepted', 'accepted', 'accepted'], array_column($acks, 'result'));
        $shift = DB::table('shifts')->where('id', $shiftId)->first();
        $this->assertNotNull($shift->closed_at);
        $this->assertSame([['currency' => 'USD', 'amount_minor' => 2950]], json_decode($shift->counted_cash, true));
        $this->assertSame(2000, (int) DB::table('cash_movements')->where('shift_id', $shiftId)->value('amount_minor'));

        // Closing again, or moving cash in a closed shift, needs a manager.
        $again = $this->push([
            $this->envelope('shift.closed', $shiftId, ['shift_id' => $shiftId, 'closed_at' => now()->toIso8601String(), 'expected_cash' => [], 'counted_cash' => []], 4),
        ])->json('data.acknowledgements.0');
        $this->assertSame('conflict', $again['result']);
        $this->assertSame('shift_already_closed', DB::table('sync_conflicts')->where('id', $again['conflict_id'])->value('type'));
    }

    public function test_cash_for_an_unknown_shift_is_kept_for_review(): void
    {
        $moveId = (string) Str::uuid7();
        $ack = $this->push([
            $this->envelope('cash.movement', $moveId, ['movement_id' => $moveId, 'shift_id' => (string) Str::uuid7(), 'direction' => 'in', 'currency' => 'USD', 'amount_minor' => 100, 'reason' => 'float_top_up', 'occurred_at' => now()->toIso8601String()], 1),
        ])->json('data.acknowledgements.0');

        $this->assertSame(['conflict', 'shift_unknown'], [$ack['result'], DB::table('sync_conflicts')->where('id', $ack['conflict_id'])->value('type')]);
    }

    public function test_shift_amounts_need_one_row_per_currency(): void
    {
        $shiftId = (string) Str::uuid7();
        $ack = $this->push([
            $this->envelope('shift.opened', $shiftId, ['shift_id' => $shiftId, 'opened_at' => now()->toIso8601String(), 'opening_float' => [['currency' => 'USD', 'amount_minor' => 1], ['currency' => 'USD', 'amount_minor' => 2]]], 1),
        ])->json('data.acknowledgements.0');

        $this->assertSame('rejected', $ack['result']);
    }
}
