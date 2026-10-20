<?php

namespace App\Sync;

use App\Models\Device;
use App\Sales\Refunds;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use stdClass;

/**
 * Applies one uploaded event, exactly once, inside one database transaction.
 *
 *   new + valid               → accepted   (stored + projected into sales tables)
 *   same event_id, same bytes → the original outcome (lost-ack recovery; accepted → "duplicate")
 *   same event_id, new bytes  → conflict   event_id_reused
 *   sequence already used     → conflict   sequence_reused
 *   sale_id already used      → conflict   sale_id_reused (stored, not projected)
 *   child record id reused    → conflict   record_id_reused (stored, not projected)
 *   invalid / wrong device    → rejected   (stored for review, not projected)
 *   sequence jumped ahead     → accepted, plus a sequence_gap conflict for the manager
 *
 * Nothing is ever discarded silently, and nothing financial is overwritten.
 */
final class SyncProcessor
{
    public function __construct(private readonly EventValidator $validator) {}

    /**
     * @return array{event_id: string, result: string, server_sequence?: int, conflict_id?: string, error?: array{code: string, message: string}}
     */
    public function process(Device $device, stdClass $event): array
    {
        return DB::transaction(fn () => $this->apply($device, $event));
    }

    private function apply(Device $device, stdClass $event): array
    {
        // Serialise per device so sequence checks cannot interleave.
        Device::whereKey($device->id)->lockForUpdate()->first();

        $eventId = $event->event_id;
        $hash = EventValidator::canonicalHash($event);
        $sequence = is_int($event->device_sequence ?? null) ? $event->device_sequence : null;

        $existing = DB::table('sync_events')->where('tenant_id', $device->tenant_id)->where('event_id', $eventId)->first();
        if ($existing) {
            if (! hash_equals($existing->payload_hash, $hash)) {
                return $this->conflictOnly($device, $event, 'event_id_reused', ['stored_hash' => $existing->payload_hash, 'incoming_hash' => $hash]);
            }

            return match ($existing->result) {
                'accepted' => ['event_id' => $eventId, 'result' => 'duplicate', 'server_sequence' => (int) $existing->server_sequence],
                'conflict' => ['event_id' => $eventId, 'result' => 'conflict', 'conflict_id' => $existing->conflict_id],
                default => $this->rejectedAck($eventId, $existing->error_code, $existing->error_message),
            };
        }

        if ($sequence !== null && DB::table('sync_events')->where('device_id', $device->id)->where('device_sequence', $sequence)->exists()) {
            return $this->conflictOnly($device, $event, 'sequence_reused', ['device_sequence' => $sequence]);
        }

        $problems = $this->identityProblems($device, $event);
        $code = $problems === [] ? 'validation_failed' : 'device_mismatch';
        $problems = $problems ?: $this->validator->validate($event);
        if ($problems !== []) {
            $message = implode('; ', array_slice($problems, 0, 5));
            $this->store($device, $event, $hash, 'rejected', errorCode: $code, errorMessage: $message);

            return $this->rejectedAck($eventId, $code, $message);
        }

        $lastSequence = (int) DB::table('sync_events')->where('device_id', $device->id)->max('device_sequence');

        if ($event->event_type === 'sale.completed' && DB::table('sales')->where('id', $event->payload->sale_id)->exists()) {
            $conflictId = $this->openConflict($device, $eventId, 'sale_id_reused', ['sale_id' => $event->payload->sale_id]);
            $serverSequence = $this->store($device, $event, $hash, 'conflict', conflictId: $conflictId);

            return ['event_id' => $eventId, 'result' => 'conflict', 'conflict_id' => $conflictId, 'server_sequence' => $serverSequence];
        }

        // Rules that depend on what the server already holds (refunds vs. their sale, shifts).
        $verdict = $this->checkAgainstStoredData($device, $event);
        if ($verdict !== null) {
            [$kind, $code, $details] = $verdict;
            if ($kind === 'rejected') {
                $this->store($device, $event, $hash, 'rejected', errorCode: 'validation_failed', errorMessage: $details['message']);

                return $this->rejectedAck($eventId, 'validation_failed', $details['message']);
            }
            $conflictId = $this->openConflict($device, $eventId, $code, $details);
            $serverSequence = $this->store($device, $event, $hash, 'conflict', conflictId: $conflictId);

            return ['event_id' => $eventId, 'result' => 'conflict', 'conflict_id' => $conflictId, 'server_sequence' => $serverSequence];
        }

        try {
            // Savepoint: the event row and every projected row commit together, or none do.
            $serverSequence = DB::transaction(function () use ($device, $event, $hash) {
                $serverSequence = $this->store($device, $event, $hash, 'accepted');
                $this->project($device, $event);

                return $serverSequence;
            });
        } catch (UniqueConstraintViolationException $e) {
            // A line, payment or movement id already exists elsewhere: keep the event for review.
            $conflictId = $this->openConflict($device, $eventId, 'record_id_reused', ['database' => Str::limit($e->getMessage(), 300)]);
            $serverSequence = $this->store($device, $event, $hash, 'conflict', conflictId: $conflictId);

            return ['event_id' => $eventId, 'result' => 'conflict', 'conflict_id' => $conflictId, 'server_sequence' => $serverSequence];
        }

        if ($sequence > $lastSequence + 1) {
            // Earlier events are missing (lost device data, restore from backup). The sale itself is fine.
            $this->openConflict($device, $eventId, 'sequence_gap', ['expected' => $lastSequence + 1, 'received' => $sequence]);
        }

        // The sale happened, so it is kept; products the catalogue does not know (or has
        // deactivated) are flagged for a manager, per the catalogue conflict policy.
        $productIds = $this->productIds($event);
        if ($productIds !== []) {
            $known = DB::table('products')->where('tenant_id', $device->tenant_id)->whereIn('id', $productIds)->where('active', true)->pluck('id')->all();
            $unknown = array_values(array_diff($productIds, $known));
            if ($unknown !== []) {
                $this->openConflict($device, $eventId, 'unknown_product', ['product_ids' => $unknown]);
            }
        }

        return ['event_id' => $eventId, 'result' => 'accepted', 'server_sequence' => $serverSequence];
    }

    /**
     * null when the event fits what is stored; otherwise ['rejected', code, ['message' => ...]]
     * for an event that can never be right, or ['conflict', type, details] for one a
     * manager must look at (it is kept, not projected).
     *
     * @return array{0: string, 1: string, 2: array<string, mixed>}|null
     */
    private function checkAgainstStoredData(Device $device, stdClass $event): ?array
    {
        $p = $event->payload;
        switch ($event->event_type) {
            case 'refund.issued':
                $sale = DB::table('sales')->where('tenant_id', $device->tenant_id)->where('id', $p->original_sale_id)->first();
                if (! $sale) {
                    return ['conflict', 'refund_original_unknown', ['original_sale_id' => $p->original_sale_id]];
                }
                foreach ($p->lines as $i => $line) {
                    $original = DB::table('sale_lines')->where('sale_id', $sale->id)->where('id', $line->original_line_id)->first();
                    if (! $original) {
                        return ['rejected', 'validation_failed', ['message' => "lines.{$i}: not on the original sale"]];
                    }
                    $already = (int) DB::table('refund_lines')->where('tenant_id', $device->tenant_id)->where('original_line_id', $original->id)->sum('quantity_milli');
                    if ($already + $line->quantity_milli > (int) $original->quantity_milli) {
                        // Possible when two tills refund the same sale offline; a manager decides.
                        return ['conflict', 'refund_exceeds_sale', [
                            'original_line_id' => $original->id, 'sold_milli' => (int) $original->quantity_milli,
                            'already_refunded_milli' => $already, 'requested_milli' => $line->quantity_milli,
                        ]];
                    }
                    $amount = Refunds::due((int) $original->line_total_minor, (int) $original->quantity_milli, $already, $line->quantity_milli, $sale->rounding);
                    $tax = Refunds::due((int) $original->tax_minor, (int) $original->quantity_milli, $already, $line->quantity_milli, $sale->rounding);
                    if ($line->amount_minor !== $amount || $line->tax_minor !== $tax) {
                        return ['rejected', 'validation_failed', ['message' => "lines.{$i}: refund should be {$amount} with tax {$tax}"]];
                    }
                }

                return null;
            case 'shift.closed':
            case 'cash.movement':
                $shift = DB::table('shifts')->where('tenant_id', $device->tenant_id)->where('id', $p->shift_id)->first();
                if (! $shift) {
                    return ['conflict', 'shift_unknown', ['shift_id' => $p->shift_id]];
                }
                if ($shift->closed_at !== null) {
                    return ['conflict', 'shift_already_closed', ['shift_id' => $p->shift_id]];
                }

                return null;
            default:
                return null;
        }
    }

    /** @return list<string> */
    private function identityProblems(Device $device, stdClass $event): array
    {
        $expected = [
            'tenant_id' => $device->tenant_id,
            'device_id' => $device->id,
            'branch_id' => $device->branch_id,
            'register_id' => $device->register_id,
        ];
        $problems = [];
        foreach ($expected as $field => $value) {
            if (($event->{$field} ?? null) !== $value) {
                $problems[] = "{$field}: does not match the authenticated device";
            }
        }

        return $problems;
    }

    private function store(Device $device, stdClass $event, string $hash, string $result, ?string $conflictId = null, ?string $errorCode = null, ?string $errorMessage = null): int
    {
        return (int) DB::table('sync_events')->insertGetId([
            'tenant_id' => $device->tenant_id,
            'event_id' => $event->event_id,
            'device_id' => $device->id,
            'device_sequence' => $event->device_sequence,
            'event_type' => mb_substr((string) ($event->event_type ?? 'unknown'), 0, 40),
            'schema_version' => is_int($event->schema_version ?? null) ? $event->schema_version : 0,
            'payload_hash' => $hash,
            'payload' => json_encode($event, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'result' => $result,
            'conflict_id' => $conflictId,
            'error_code' => $errorCode,
            'error_message' => $errorMessage,
            'occurred_at' => $this->time($event->occurred_at ?? null),
            'received_at' => now(),
        ], 'server_sequence');
    }

    /** A conflict that cannot be stored as an event (its id or sequence is taken); the payload is kept in the conflict. */
    private function conflictOnly(Device $device, stdClass $event, string $type, array $details): array
    {
        $conflictId = $this->openConflict($device, $event->event_id, $type, [...$details, 'payload' => $event]);

        return ['event_id' => $event->event_id, 'result' => 'conflict', 'conflict_id' => $conflictId];
    }

    private function openConflict(Device $device, string $eventId, string $type, array $details): string
    {
        $id = (string) Str::uuid7();
        DB::table('sync_conflicts')->insert([
            'id' => $id,
            'tenant_id' => $device->tenant_id,
            'device_id' => $device->id,
            'event_id' => $eventId,
            'type' => $type,
            'details' => json_encode($details, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'status' => 'open',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function rejectedAck(string $eventId, ?string $code, ?string $message): array
    {
        return ['event_id' => $eventId, 'result' => 'rejected', 'error' => ['code' => $code ?? 'rejected', 'message' => $message ?? 'Rejected']];
    }

    /** @return list<string> */
    private function productIds(stdClass $event): array
    {
        return array_values(array_unique(match ($event->event_type) {
            'sale.completed' => array_map(fn (stdClass $l) => $l->product_id, $event->payload->lines),
            'stock.adjusted' => [$event->payload->product_id],
            default => [],
        }));
    }

    /** Central records derived from an accepted event, in the same transaction as the event row. */
    private function project(Device $device, stdClass $event): void
    {
        if ($event->event_type === 'stock.adjusted') {
            $a = $event->payload;
            DB::table('stock_movements')->insert([
                'id' => $a->adjustment_id,
                'tenant_id' => $device->tenant_id,
                'branch_id' => $event->branch_id,
                'product_id' => $a->product_id,
                'quantity_delta_milli' => $a->quantity_delta_milli,
                'reason' => $a->reason,
                'sale_id' => null,
                'device_id' => $device->id,
                'event_id' => $event->event_id,
                'occurred_at' => $this->time($event->occurred_at),
                'created_at' => now(),
            ]);

            return;
        }
        if (in_array($event->event_type, ['refund.issued', 'shift.opened', 'shift.closed', 'cash.movement'], true)) {
            $this->projectShiftsAndRefunds($device, $event);

            return;
        }
        if ($event->event_type !== 'sale.completed') {
            return;
        }
        $sale = $event->payload;
        $tenant = $device->tenant_id;
        $completedAt = $this->time($sale->completed_at);

        DB::table('sales')->insert([
            'id' => $sale->sale_id,
            'tenant_id' => $tenant,
            'branch_id' => $event->branch_id,
            'register_id' => $event->register_id,
            'device_id' => $device->id,
            'event_id' => $event->event_id,
            'actor_user_id' => $event->actor_user_id,
            'receipt_number' => $sale->receipt_number,
            'currency' => $sale->currency,
            'rounding' => $sale->rounding,
            'subtotal_minor' => $sale->totals->subtotal_minor,
            'discount_minor' => $sale->totals->discount_minor,
            'tax_minor' => $sale->totals->tax_minor,
            'total_minor' => $sale->totals->total_minor,
            'change_minor' => $sale->change_minor,
            'shift_id' => $sale->shift_id ?? null,
            'catalogue_version' => $sale->catalogue_version,
            'price_list_version' => $sale->price_list_version,
            'completed_at' => $completedAt,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('sale_lines')->insert(array_map(fn (stdClass $line, int $i) => [
            'id' => $line->line_id,
            'tenant_id' => $tenant,
            'sale_id' => $sale->sale_id,
            'position' => $i,
            'product_id' => $line->product_id,
            'sku' => $line->sku,
            'name' => $line->name,
            'quantity_milli' => $line->quantity_milli,
            'unit_price_minor' => $line->unit_price_minor,
            'discount_minor' => $line->discount_minor,
            'tax_code' => $line->tax->code,
            'tax_rate_bp' => $line->tax->rate_bp,
            'tax_inclusive' => $line->tax->inclusive,
            'tax_minor' => $line->tax->amount_minor,
            'line_total_minor' => $line->line_total_minor,
        ], $sale->lines, array_keys($sale->lines)));

        DB::table('sale_payments')->insert(array_map(fn (stdClass $p) => [
            'id' => $p->payment_id,
            'tenant_id' => $tenant,
            'sale_id' => $sale->sale_id,
            'method_code' => $p->method_code,
            'status' => $p->status,
            'currency' => $p->currency,
            'amount_minor' => $p->amount_minor,
            'sale_currency_amount_minor' => $p->sale_currency_amount_minor,
            'exchange_rate' => $p->exchange_rate ?? null,
            'exchange_rate_version' => $p->exchange_rate_version ?? null,
            'reference' => $p->reference ?? null,
        ], $sale->payments));

        if ($sale->stock_movements !== []) {
            DB::table('stock_movements')->insert(array_map(fn (stdClass $m) => [
                'id' => $m->movement_id,
                'tenant_id' => $tenant,
                'branch_id' => $event->branch_id,
                'product_id' => $m->product_id,
                'quantity_delta_milli' => $m->quantity_delta_milli,
                'reason' => 'sale',
                'sale_id' => $sale->sale_id,
                'device_id' => $device->id,
                'event_id' => $event->event_id,
                'occurred_at' => $completedAt,
                'created_at' => now(),
            ], $sale->stock_movements));
        }
    }

    private function projectShiftsAndRefunds(Device $device, stdClass $event): void
    {
        $p = $event->payload;
        $tenant = $device->tenant_id;

        switch ($event->event_type) {
            case 'refund.issued':
                $refundedAt = $this->time($p->refunded_at);
                DB::table('refunds')->insert([
                    'id' => $p->refund_id, 'tenant_id' => $tenant, 'branch_id' => $event->branch_id, 'register_id' => $event->register_id,
                    'device_id' => $device->id, 'event_id' => $event->event_id, 'actor_user_id' => $event->actor_user_id,
                    'original_sale_id' => $p->original_sale_id, 'receipt_number' => $p->receipt_number, 'reason' => $p->reason,
                    'note' => $p->note ?? null, 'currency' => $p->currency, 'total_minor' => $p->totals->total_minor,
                    'tax_minor' => $p->totals->tax_minor, 'shift_id' => $p->shift_id ?? null, 'refunded_at' => $refundedAt,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                DB::table('refund_lines')->insert(array_map(fn (stdClass $l) => [
                    'id' => $l->refund_line_id, 'tenant_id' => $tenant, 'refund_id' => $p->refund_id, 'original_line_id' => $l->original_line_id,
                    'product_id' => $l->product_id, 'quantity_milli' => $l->quantity_milli, 'amount_minor' => $l->amount_minor,
                    'tax_minor' => $l->tax_minor, 'restock' => $l->restock,
                ], $p->lines));
                DB::table('refund_payments')->insert(array_map(fn (stdClass $pay) => [
                    'id' => $pay->payment_id, 'tenant_id' => $tenant, 'refund_id' => $p->refund_id, 'method_code' => $pay->method_code,
                    'currency' => $pay->currency, 'amount_minor' => $pay->amount_minor, 'sale_currency_amount_minor' => $pay->sale_currency_amount_minor,
                    'exchange_rate' => $pay->exchange_rate ?? null, 'reference' => $pay->reference ?? null,
                ], $p->payments));
                if ($p->stock_movements !== []) {
                    DB::table('stock_movements')->insert(array_map(fn (stdClass $m) => [
                        'id' => $m->movement_id, 'tenant_id' => $tenant, 'branch_id' => $event->branch_id, 'product_id' => $m->product_id,
                        'quantity_delta_milli' => $m->quantity_delta_milli, 'reason' => 'refund', 'sale_id' => $p->original_sale_id,
                        'device_id' => $device->id, 'event_id' => $event->event_id, 'occurred_at' => $refundedAt, 'created_at' => now(),
                    ], $p->stock_movements));
                }

                return;
            case 'shift.opened':
                DB::table('shifts')->insert([
                    'id' => $p->shift_id, 'tenant_id' => $tenant, 'branch_id' => $event->branch_id, 'register_id' => $event->register_id,
                    'device_id' => $device->id, 'opened_by_user_id' => $event->actor_user_id, 'opened_at' => $this->time($p->opened_at),
                    'opening_float' => json_encode($p->opening_float), 'created_at' => now(), 'updated_at' => now(),
                ]);

                return;
            case 'shift.closed':
                DB::table('shifts')->where('tenant_id', $tenant)->where('id', $p->shift_id)->update([
                    'closed_at' => $this->time($p->closed_at), 'closed_by_user_id' => $event->actor_user_id,
                    'expected_cash' => json_encode($p->expected_cash), 'counted_cash' => json_encode($p->counted_cash),
                    'note' => $p->note ?? null, 'updated_at' => now(),
                ]);

                return;
            case 'cash.movement':
                DB::table('cash_movements')->insert([
                    'id' => $p->movement_id, 'tenant_id' => $tenant, 'shift_id' => $p->shift_id, 'device_id' => $device->id,
                    'actor_user_id' => $event->actor_user_id, 'direction' => $p->direction, 'currency' => $p->currency,
                    'amount_minor' => $p->amount_minor, 'reason' => $p->reason, 'note' => $p->note ?? null,
                    'occurred_at' => $this->time($p->occurred_at), 'created_at' => now(),
                ]);

                return;
        }
    }

    private function time(mixed $iso): ?Carbon
    {
        return is_string($iso) ? Carbon::parse($iso)->utc() : null;
    }
}
