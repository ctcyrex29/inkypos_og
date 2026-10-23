<?php

namespace Tests\Feature\Api\V1;

use App\Auth\Role;
use App\Catalogue\Catalogue;
use App\Models\Device;
use App\Models\Membership;
use App\Models\Tenant;
use App\Models\User;
use App\Staff\StaffPin;
use App\Support\Base64Url;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use stdClass;
use Tests\Concerns\BuildsTenants;
use Tests\TestCase;

class StaffTest extends TestCase
{
    use BuildsTenants, RefreshDatabase;

    private Tenant $tenant;

    private User $owner;

    private User $manager;

    private User $cashier;

    /** @var array<string, string> */
    private array $headers;

    protected function setUp(): void
    {
        parent::setUp();
        // Keep the suite fast; production uses config('inkypos.staff_pin.iterations').
        config(['inkypos.staff_pin.iterations' => StaffPin::MIN_ITERATIONS]);
        $this->tenant = $this->makeTenant('Shop', 'growth');
        app(TenantContext::class)->run($this->tenant, fn () => app(Catalogue::class)->seedDefaults());
        $this->owner = $this->makeUser($this->tenant, Role::Manager);
        $this->manager = $this->makeUser($this->tenant, Role::Manager);
        $this->cashier = $this->makeUser($this->tenant, Role::Cashier);
        $this->headers = $this->userHeaders($this->manager, $this->tenant);
    }

    private function membership(User $user, ?Tenant $tenant = null): Membership
    {
        return Membership::where('tenant_id', ($tenant ?? $this->tenant)->id)->where('user_id', $user->id)->firstOrFail();
    }

    /** @return list<array<string, mixed>> every change the caller receives from an empty cursor */
    private function feed(array $headers, string $cursor = ''): array
    {
        $changes = [];
        for ($i = 0; $i < 20; $i++) {
            $page = $this->getJson('/api/v1/sync/changes?'.http_build_query(['cursor' => $cursor]), $headers)->assertOk()->json('data');
            $changes = [...$changes, ...$page['changes']];
            $cursor = $page['next_cursor'];
            if (! $page['has_more']) {
                break;
            }
        }

        return $changes;
    }

    /** @return array<string, array<string, mixed>> staff entries by user id */
    private function staffInFeed(array $headers): array
    {
        return collect($this->feed($headers))->where('entity', 'staff')->mapWithKeys(fn ($c) => [$c['id'] => $c['data']])->all();
    }

    public function test_manager_sets_a_pin_that_is_stored_only_as_a_slow_hash(): void
    {
        $data = $this->putJson("/api/v1/staff/{$this->cashier->id}/pin", ['pin' => '4821'], $this->headers)->assertOk()->json('data');

        $this->assertSame([true, 2], [$data['has_pin'], $data['version']]);
        $m = $this->membership($this->cashier);
        $this->assertSame(['pbkdf2-sha256', StaffPin::MIN_ITERATIONS], [$m->pin_algorithm, $m->pin_iterations]);
        $this->assertSame(Base64Url::decode($m->pin_hash), StaffPin::derive('4821', Base64Url::decode($m->pin_salt), $m->pin_iterations));
        $this->assertStringNotContainsString('4821', json_encode(DB::table('memberships')->get()).json_encode(DB::table('audit_logs')->get()));
        $this->assertDatabaseHas('audit_logs', ['action' => 'staff.pin_set', 'subject_id' => $m->id]);

        // Two people with the same PIN get different hashes.
        $this->putJson("/api/v1/staff/{$this->manager->id}/pin", ['pin' => '4821'], $this->headers)->assertOk();
        $this->assertNotSame($m->pin_hash, $this->membership($this->manager)->pin_hash);
    }

    public function test_weak_or_malformed_pins_are_refused(): void
    {
        foreach (['', '12', '1234567', 'abcd', '12a4', '0000', '999999', '1234', '6543', '345678'] as $pin) {
            $this->putJson("/api/v1/staff/{$this->cashier->id}/pin", ['pin' => $pin], $this->headers)->assertStatus(422);
        }
        $this->assertFalse($this->membership($this->cashier)->hasPin());
    }

    public function test_only_managers_manage_staff(): void
    {
        $cashierHeaders = $this->userHeaders($this->cashier, $this->tenant);
        $this->getJson('/api/v1/staff', $cashierHeaders)->assertStatus(403);
        $this->putJson("/api/v1/staff/{$this->cashier->id}/pin", ['pin' => '4821'], $cashierHeaders)->assertStatus(403);

        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->owner);
        $this->getJson('/api/v1/staff', $this->deviceHeaders($device, $secret))->assertStatus(403);

        $list = $this->getJson('/api/v1/staff', $this->headers)->assertOk()->json('data');
        $this->assertEqualsCanonicalizing([$this->owner->id, $this->manager->id, $this->cashier->id], array_column($list, 'id'));
        $this->assertArrayNotHasKey('pin', $list[0], 'hashes are for tills, not for the back office');
    }

    public function test_any_manager_manages_other_managers_but_the_last_one_with_a_login_stays(): void
    {
        // Two managers with logins ($this->owner, now a manager, and $this->manager): either can change the other.
        $this->putJson("/api/v1/staff/{$this->owner->id}/pin", ['pin' => '4821'], $this->headers)->assertOk();
        $this->patchJson("/api/v1/staff/{$this->owner->id}", ['active' => false], $this->headers)->assertOk();

        // Now $this->manager is the only active manager who can sign in: a till-only manager does not count.
        $tillManager = $this->postJson('/api/v1/staff', ['name' => 'Shift lead', 'role' => 'manager'], $this->headers)->assertCreated()->json('data.id');
        $this->patchJson("/api/v1/staff/{$this->manager->id}", ['active' => false], $this->headers)->assertStatus(422); // yourself
        $this->assertTrue($this->membership($this->manager)->isActive());
        $this->patchJson("/api/v1/staff/{$tillManager}", ['active' => false], $this->headers)->assertOk();
    }

    public function test_a_manager_can_sell_as_well_as_manage(): void
    {
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->manager);
        $this->putJson("/api/v1/staff/{$this->manager->id}/pin", ['pin' => '4821'], $this->headers)->assertOk();
        $staff = $this->staffInFeed($this->deviceHeaders($device, $secret));
        $this->assertSame('manager', $staff[$this->manager->id]['role']);
        $this->assertNotNull($staff[$this->manager->id]['pin'], 'managers sign in on tills and sell like cashiers');
    }

    public function test_tills_receive_staff_with_pin_hashes_and_users_never_do(): void
    {
        $this->putJson("/api/v1/staff/{$this->cashier->id}/pin", ['pin' => '4821'], $this->headers)->assertOk();
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->owner);
        $deviceHeaders = $this->deviceHeaders($device, $secret);

        $staff = $this->staffInFeed($deviceHeaders);
        $this->assertEqualsCanonicalizing([$this->owner->id, $this->manager->id, $this->cashier->id], array_keys($staff));
        $cashier = $staff[$this->cashier->id];
        $this->assertSame(['Cashier', 'cashier', true, 2], [$cashier['name'], $cashier['role'], $cashier['active'], $cashier['version']]);
        $this->assertSame(['algorithm', 'iterations', 'salt', 'hash'], array_keys($cashier['pin']));
        $this->assertNull($staff[$this->manager->id]['pin']);

        $this->assertSame([], $this->staffInFeed($this->headers), 'a manager reading the feed gets no staff');
        $this->assertSame([], $this->staffInFeed($this->userHeaders($this->cashier, $this->tenant)), 'nor does a cashier');
    }

    public function test_pin_and_status_changes_reach_tills_through_the_log(): void
    {
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->owner);
        $deviceHeaders = $this->deviceHeaders($device, $secret);
        $cursor = $this->getJson('/api/v1/sync/changes', $deviceHeaders)->json('data.next_cursor');

        $this->putJson("/api/v1/staff/{$this->cashier->id}/pin", ['pin' => '4821'], $this->headers)->assertOk();
        $this->patchJson("/api/v1/staff/{$this->cashier->id}", ['active' => false], $this->headers)->assertOk()->assertJsonPath('data.active', false);
        $changes = collect($this->feed($deviceHeaders, $cursor))->where('entity', 'staff')->values();
        $this->assertCount(1, $changes, 'two edits collapse into the current state');
        $this->assertSame([false, 3], [$changes[0]['data']['active'], $changes[0]['version']]);

        $userChanges = collect($this->feed($this->headers, $cursor))->where('entity', 'staff');
        $this->assertCount(0, $userChanges);

        $this->deleteJson("/api/v1/staff/{$this->cashier->id}/pin", [], $this->headers)->assertOk()->assertJsonPath('data.has_pin', false);
        $this->assertNull(collect($this->feed($deviceHeaders, $cursor))->firstWhere('entity', 'staff')['data']['pin']);
    }

    public function test_deactivated_staff_lose_back_office_access_and_nobody_deactivates_themselves(): void
    {
        $this->patchJson("/api/v1/staff/{$this->manager->id}", ['active' => false], $this->headers)->assertStatus(422);

        $managerHeaders = $this->headers;
        $this->patchJson("/api/v1/staff/{$this->manager->id}", ['active' => false], $this->userHeaders($this->owner, $this->tenant))->assertOk();
        $this->getJson('/api/v1/branches', $managerHeaders)->assertStatus(403);

        $this->patchJson("/api/v1/staff/{$this->manager->id}", ['active' => true], $this->userHeaders($this->owner, $this->tenant))->assertOk();
        $this->getJson('/api/v1/branches', $managerHeaders)->assertOk();
    }

    public function test_cross_tenant_staff_access_is_refused(): void
    {
        $other = $this->makeTenant('Other', 'growth');
        $theirCashier = $this->makeUser($other, Role::Cashier);
        $theirOwner = $this->makeUser($other, Role::Manager);
        $this->putJson("/api/v1/staff/{$theirCashier->id}/pin", ['pin' => '7395'], $this->userHeaders($theirOwner, $other))->assertOk();

        $this->putJson("/api/v1/staff/{$theirCashier->id}/pin", ['pin' => '4821'], $this->headers)->assertStatus(404);
        $this->deleteJson("/api/v1/staff/{$theirCashier->id}/pin", [], $this->headers)->assertStatus(404);
        $this->patchJson("/api/v1/staff/{$theirCashier->id}", ['active' => false], $this->headers)->assertStatus(404);
        $this->putJson('/api/v1/staff/not-a-uuid/pin', ['pin' => '4821'], $this->headers)->assertStatus(404);
        $this->assertNotContains($theirCashier->id, array_column($this->getJson('/api/v1/staff', $this->headers)->json('data'), 'id'));

        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->owner);
        $this->assertArrayNotHasKey($theirCashier->id, $this->staffInFeed($this->deviceHeaders($device, $secret)));

        $theirs = $this->membership($theirCashier, $other);
        $this->assertTrue($theirs->isActive());
        $this->assertSame(2, $theirs->version);
    }

    // ── Till-only staff ──

    public function test_a_manager_adds_a_till_only_cashier_who_signs_in_on_tills_but_never_the_back_office(): void
    {
        $created = $this->postJson('/api/v1/staff', ['name' => ' Tendai ', 'pin' => '5813'], $this->headers)->assertCreated()->json('data');

        $this->assertSame(['Tendai', 'cashier', true, true, null, true], [
            $created['name'], $created['role'], $created['till_only'], $created['has_pin'], $created['email'], $created['active'],
        ]);
        $user = User::findOrFail($created['id']);
        $this->assertNull($user->password);
        $this->assertDatabaseHas('audit_logs', ['action' => 'staff.created']);

        // Tills receive them with their PIN, like anyone else.
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->owner);
        $onTill = $this->staffInFeed($this->deviceHeaders($device, $secret))[$created['id']];
        $this->assertSame(['Tendai', 'cashier', true], [$onTill['name'], $onTill['role'], $onTill['active']]);
        $this->assertSame(Base64Url::decode($onTill['pin']['hash']), StaffPin::derive('5813', Base64Url::decode($onTill['pin']['salt']), $onTill['pin']['iterations']));

        // No email and no password: nothing to sign in to the API with.
        $this->postJson('/api/v1/auth/login', ['email' => '', 'password' => '', 'device_name' => 'x'])->assertStatus(422);
        $this->assertFalse(User::whereNull('email')->get()->contains(fn (User $u) => $u->password !== null));
    }

    public function test_till_only_staff_can_be_added_without_a_pin_renamed_and_deactivated(): void
    {
        $created = $this->postJson('/api/v1/staff', ['name' => 'Rudo'], $this->headers)->assertCreated()->json('data');
        $this->assertFalse($created['has_pin']);

        $this->patchJson("/api/v1/staff/{$created['id']}", ['name' => 'Rudo M.'], $this->headers)->assertOk()->assertJsonPath('data.name', 'Rudo M.');
        $this->patchJson("/api/v1/staff/{$created['id']}", ['active' => false], $this->headers)->assertOk()->assertJsonPath('data.active', false);
        $this->assertDatabaseHas('audit_logs', ['action' => 'staff.renamed']);

        // People with a login keep their own name.
        $this->patchJson("/api/v1/staff/{$this->cashier->id}", ['name' => 'Someone else'], $this->headers)->assertStatus(422);
    }

    public function test_adding_staff_checks_the_pin_the_role_and_who_is_asking(): void
    {
        $this->postJson('/api/v1/staff', ['name' => 'Weak', 'pin' => '1111'], $this->headers)->assertStatus(422);
        $this->postJson('/api/v1/staff', ['name' => 'Boss', 'role' => 'owner'], $this->headers)->assertStatus(422);
        $this->postJson('/api/v1/staff', ['name' => 'Shift lead', 'role' => 'manager'], $this->headers)
            ->assertCreated()->assertJsonPath('data.role', 'manager');
        $this->postJson('/api/v1/staff', ['name' => 'X'], $this->userHeaders($this->cashier, $this->tenant))->assertStatus(403);
        $this->assertSame(0, User::where('name', 'Weak')->count(), 'a refused request creates nobody');
    }

    public function test_till_only_staff_belong_to_one_business_only(): void
    {
        $other = $this->makeTenant('Other', 'growth');
        $otherHeaders = $this->userHeaders($this->makeUser($other, Role::Manager), $other);
        $theirs = $this->postJson('/api/v1/staff', ['name' => 'Their cashier', 'pin' => '5813'], $otherHeaders)->assertCreated()->json('data');
        $mine = $this->postJson('/api/v1/staff', ['name' => 'My cashier'], $this->headers)->assertCreated()->json('data');

        $this->assertNotContains($theirs['id'], array_column($this->getJson('/api/v1/staff', $this->headers)->json('data'), 'id'));
        $this->assertNotContains($mine['id'], array_column($this->getJson('/api/v1/staff', $otherHeaders)->json('data'), 'id'));
        $this->patchJson("/api/v1/staff/{$theirs['id']}", ['name' => 'Hijacked'], $this->headers)->assertStatus(404);
        $this->assertSame('Their cashier', User::findOrFail($theirs['id'])->name);

        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->owner);
        $feed = $this->staffInFeed($this->deviceHeaders($device, $secret));
        $this->assertArrayHasKey($mine['id'], $feed);
        $this->assertArrayNotHasKey($theirs['id'], $feed);
    }

    // ── Sales are flagged, never rejected, when the cashier is not active staff ──

    private function sale(Device $device, string $actorId, int $sequence, ?string $occurredAt = null): stdClass
    {
        $vectors = json_decode((string) file_get_contents(dirname(__DIR__, 6).'/packages/core/test-vectors/sale-events.v1.json'));
        $event = json_decode(json_encode($vectors[0]->event));
        foreach (['tenant_id' => $device->tenant_id, 'branch_id' => $device->branch_id, 'register_id' => $device->register_id, 'device_id' => $device->id] as $k => $v) {
            $event->{$k} = $v;
        }
        $event->event_id = (string) Str::uuid7();
        $event->device_sequence = $sequence;
        $event->actor_user_id = $actorId;
        $event->payload->sale_id = $event->aggregate_id = (string) Str::uuid7();
        foreach ([...$event->payload->lines, ...$event->payload->payments, ...$event->payload->stock_movements] as $record) {
            foreach (['line_id', 'payment_id', 'movement_id'] as $key) {
                if (isset($record->{$key})) {
                    $record->{$key} = (string) Str::uuid7();
                }
            }
        }
        if ($occurredAt !== null) {
            $event->occurred_at = $event->payload->completed_at = $occurredAt;
        }

        return $event;
    }

    private function upload(Device $device, string $secret, stdClass $event): array
    {
        return $this->postJson('/api/v1/sync/events', ['batch_id' => (string) Str::uuid7(), 'device_id' => $device->id, 'events' => [$event]], $this->deviceHeaders($device, $secret))
            ->assertOk()->json('data.acknowledgements.0');
    }

    private function actorConflicts(): array
    {
        return DB::table('sync_conflicts')->where('type', 'unknown_actor')->pluck('details')->map(fn ($d) => json_decode($d, true)['actor_user_id'])->all();
    }

    public function test_sales_by_someone_who_is_not_active_staff_are_kept_and_flagged(): void
    {
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->owner);
        $other = $this->makeTenant('Other');
        $outsider = $this->makeUser($other, Role::Cashier);

        $this->assertSame('accepted', $this->upload($device, $secret, $this->sale($device, $this->cashier->id, 1))['result']);
        $this->assertSame([], $this->actorConflicts(), 'an active cashier raises nothing');

        $this->assertSame('accepted', $this->upload($device, $secret, $this->sale($device, $device->id, 2))['result']);
        $this->assertSame('accepted', $this->upload($device, $secret, $this->sale($device, $outsider->id, 3))['result']);
        $this->assertSame([$device->id, $outsider->id], $this->actorConflicts());
        $this->assertSame(3, DB::table('sales')->count(), 'every sale is kept');
    }

    public function test_a_sale_made_before_a_deactivation_is_not_flagged_but_one_after_is(): void
    {
        ['device' => $device, 'secret' => $secret] = $this->makeDevice($this->tenant, by: $this->owner);
        $this->patchJson("/api/v1/staff/{$this->cashier->id}", ['active' => false], $this->headers)->assertOk();

        $before = $this->sale($device, $this->cashier->id, 1, now()->subHour()->toIso8601String());
        $after = $this->sale($device, $this->cashier->id, 2, now()->addMinute()->toIso8601String());
        $this->assertSame('accepted', $this->upload($device, $secret, $before)['result']);
        $this->assertSame([], $this->actorConflicts(), 'made offline while the cashier was still active');
        $this->assertSame('accepted', $this->upload($device, $secret, $after)['result']);
        $this->assertSame([$this->cashier->id], $this->actorConflicts());
    }
}
