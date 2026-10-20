<?php

namespace Tests\Feature\Api\V1;

use App\Models\Device;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use stdClass;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

class SyncTest extends TestCase
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

    /** A valid sale from the shared vectors, re-identified for this device with fresh ids. */
    private function sale(int $sequence, ?Device $device = null): stdClass
    {
        $device ??= $this->device;
        $vectors = json_decode((string) file_get_contents(dirname(__DIR__, 6).'/packages/core/test-vectors/sale-events.v1.json'));
        $event = json_decode(json_encode($vectors[0]->event));
        $event->event_id = (string) Str::uuid7();
        $event->device_sequence = $sequence;
        $event->tenant_id = $device->tenant_id;
        $event->branch_id = $device->branch_id;
        $event->register_id = $device->register_id;
        $event->device_id = $device->id;
        $event->payload->sale_id = $event->aggregate_id = (string) Str::uuid7();
        foreach ($event->payload->lines as $line) {
            $line->line_id = (string) Str::uuid7();
        }
        foreach ($event->payload->payments as $payment) {
            $payment->payment_id = (string) Str::uuid7();
        }
        foreach ($event->payload->stock_movements as $movement) {
            $movement->movement_id = (string) Str::uuid7();
        }

        return $event;
    }

    /** Sends events exactly as the client does: a raw JSON body. */
    private function push(array $events, ?array $headers = null, ?string $deviceId = null): TestResponse
    {
        $body = json_encode(['batch_id' => (string) Str::uuid7(), 'device_id' => $deviceId ?? $this->device->id, 'events' => $events]);

        return $this->call('POST', '/api/v1/sync/events', [], [], [], $this->server($headers ?? $this->headers), $body);
    }

    private function server(array $headers): array
    {
        $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'];
        foreach ($headers as $name => $value) {
            $server['HTTP_'.strtoupper(str_replace('-', '_', $name))] = $value;
        }

        return $server;
    }

    private function ack(TestResponse $response, int $i = 0): array
    {
        return $response->assertOk()->json("data.acknowledgements.{$i}");
    }

    public function test_accepts_a_sale_and_projects_it_atomically(): void
    {
        $event = $this->sale(1);
        $ack = $this->ack($this->push([$event]));

        $this->assertSame(['event_id' => $event->event_id, 'result' => 'accepted', 'server_sequence' => $ack['server_sequence']], $ack);
        $sale = DB::table('sales')->where('id', $event->payload->sale_id)->first();
        $this->assertSame($event->payload->totals->total_minor, (int) $sale->total_minor);
        $this->assertSame($this->device->tenant_id, $sale->tenant_id);
        $this->assertSame(3, DB::table('sale_lines')->where('sale_id', $sale->id)->count());
        $this->assertSame('recorded', DB::table('sale_payments')->where('sale_id', $sale->id)->value('status'));
        $this->assertSame(-4250, (int) DB::table('stock_movements')->where('sale_id', $sale->id)->sum('quantity_delta_milli'));
    }

    public function test_resending_after_a_lost_ack_returns_duplicate_and_creates_nothing(): void
    {
        $event = $this->sale(1);
        $first = $this->ack($this->push([$event]));
        $again = $this->ack($this->push([$event]));

        $this->assertSame('duplicate', $again['result']);
        $this->assertSame($first['server_sequence'], $again['server_sequence']);
        $this->assertSame(1, DB::table('sales')->count());
        $this->assertSame(1, DB::table('sync_events')->count());
    }

    public function test_key_order_does_not_change_identity(): void
    {
        $event = $this->sale(1);
        $this->push([$event]);
        $reordered = (object) array_reverse(get_object_vars($event), true);

        $this->assertSame('duplicate', $this->ack($this->push([$reordered]))['result']);
    }

    public function test_reusing_an_event_id_with_different_content_is_a_conflict(): void
    {
        $event = $this->sale(1);
        $this->push([$event]);
        $tampered = json_decode(json_encode($event));
        $tampered->payload->receipt_number = 'EDITED';

        $ack = $this->ack($this->push([$tampered]));

        $this->assertSame('conflict', $ack['result']);
        $this->assertSame('event_id_reused', DB::table('sync_conflicts')->where('id', $ack['conflict_id'])->value('type'));
        $this->assertNotSame('EDITED', DB::table('sales')->value('receipt_number'), 'stored sale is never overwritten');
    }

    public function test_reusing_a_device_sequence_is_a_conflict(): void
    {
        $this->push([$this->sale(1)]);
        $ack = $this->ack($this->push([$this->sale(1)]));

        $this->assertSame('conflict', $ack['result']);
        $this->assertSame('sequence_reused', DB::table('sync_conflicts')->where('id', $ack['conflict_id'])->value('type'));
        $this->assertSame(1, DB::table('sales')->count());
    }

    public function test_invalid_arithmetic_is_rejected_kept_and_rejected_again_on_retry(): void
    {
        $event = $this->sale(1);
        $event->payload->totals->total_minor += 1;

        $ack = $this->ack($this->push([$event]));
        $this->assertSame('rejected', $ack['result']);
        $this->assertSame('validation_failed', $ack['error']['code']);
        $this->assertStringContainsString('totals.total_minor', $ack['error']['message']);
        $this->assertSame(0, DB::table('sales')->count());
        $this->assertSame('rejected', DB::table('sync_events')->value('result'), 'kept for review, not discarded');

        $this->assertSame('rejected', $this->ack($this->push([$event]))['result']);
    }

    public function test_an_event_claiming_another_tenant_or_register_is_rejected(): void
    {
        $other = $this->makeTenant('Other');
        $event = $this->sale(1);
        $event->tenant_id = $other->id;

        $ack = $this->ack($this->push([$event]));

        $this->assertSame('rejected', $ack['result']);
        $this->assertSame('device_mismatch', $ack['error']['code']);
        $this->assertSame(0, DB::table('sales')->count());
        $this->assertSame($this->device->tenant_id, DB::table('sync_events')->value('tenant_id'), 'stored under the real tenant');
    }

    public function test_a_sequence_gap_is_accepted_and_flagged_for_review(): void
    {
        $this->push([$this->sale(1)]);
        $ack = $this->ack($this->push([$this->sale(4)]));

        $this->assertSame('accepted', $ack['result']);
        $gap = DB::table('sync_conflicts')->where('type', 'sequence_gap')->first();
        $this->assertSame(['expected' => 2, 'received' => 4], json_decode($gap->details, true));
    }

    public function test_a_reused_sale_id_is_a_conflict_not_a_second_sale(): void
    {
        $first = $this->sale(1);
        $this->push([$first]);
        $second = $this->sale(2);
        $second->payload->sale_id = $second->aggregate_id = $first->payload->sale_id;

        $ack = $this->ack($this->push([$second]));

        $this->assertSame('conflict', $ack['result']);
        $this->assertSame(1, DB::table('sales')->count());
        $this->assertSame('conflict', DB::table('sync_events')->where('event_id', $second->event_id)->value('result'));
    }

    public function test_a_colliding_child_record_rolls_back_the_whole_projection(): void
    {
        $first = $this->sale(1);
        $this->push([$first]);
        $second = $this->sale(2);
        $second->payload->stock_movements[2]->movement_id = $first->payload->stock_movements[2]->movement_id;

        $ack = $this->ack($this->push([$second]));

        $this->assertSame('conflict', $ack['result']);
        $this->assertSame('record_id_reused', DB::table('sync_conflicts')->where('id', $ack['conflict_id'])->value('type'));
        $this->assertNull(DB::table('sales')->where('id', $second->payload->sale_id)->first(), 'no partial sale');
        $this->assertSame(0, DB::table('sale_lines')->where('sale_id', $second->payload->sale_id)->count());
    }

    public function test_one_bad_event_does_not_block_the_rest_of_the_batch(): void
    {
        $bad = $this->sale(2);
        $bad->payload->change_minor += 5;

        $response = $this->push([$this->sale(1), $bad, $this->sale(3)]);

        $this->assertSame(['accepted', 'rejected', 'accepted'], array_column($response->json('data.acknowledgements'), 'result'));
        $this->assertSame(2, DB::table('sales')->count());
    }

    public function test_batch_envelope_is_checked(): void
    {
        $this->push([$this->sale(1)], deviceId: (string) Str::uuid7())->assertStatus(403);
        $this->push([])->assertStatus(422);
        $this->push(array_map(fn ($i) => $this->sale($i), range(1, 101)))->assertStatus(422);
        $this->call('POST', '/api/v1/sync/events', [], [], [], $this->server($this->headers), '{not json')->assertStatus(422);
    }

    public function test_only_devices_can_upload(): void
    {
        $owner = $this->makeUser(\App\Models\Tenant::findOrFail($this->device->tenant_id));

        $this->push([$this->sale(1)], $this->userHeaders($owner, \App\Models\Tenant::findOrFail($this->device->tenant_id)))
            ->assertStatus(403)->assertJsonPath('error.code', 'forbidden');
    }

    public function test_event_ids_are_scoped_per_tenant(): void
    {
        $tenantB = $this->makeTenant('B');
        ['device' => $deviceB, 'secret' => $secretB] = $this->makeDevice($tenantB);
        $event = $this->sale(1);
        $this->push([$event]);

        // Another business happening to send the same event id is unaffected by ours.
        $mine = $this->sale(1, $deviceB);
        $mine->event_id = $event->event_id;
        $ack = $this->ack($this->push([$mine], $this->deviceHeaders($deviceB, $secretB), $deviceB->id));

        $this->assertSame('accepted', $ack['result']);
        $this->assertSame(1, DB::table('sales')->where('tenant_id', $tenantB->id)->count());
    }
}
