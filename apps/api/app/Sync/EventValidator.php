<?php

namespace App\Sync;

use App\Sales\Pricing;
use InvalidArgumentException;
use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;
use stdClass;

/**
 * Server-side validation of an uploaded event, in two layers that mirror the
 * client exactly:
 *  1. Structure: the JSON Schema generated from the TypeScript zod schema
 *     (resources/schemas/sync-push-request.v1.json, kept identical to packages/core).
 *  2. Arithmetic and consistency: a port of the zod superRefine rules in
 *     packages/core/src/sync/events.ts, using the ported pricing rule.
 *
 * Verified against packages/core/test-vectors/sale-events.v1.json.
 */
final class EventValidator
{
    private ?object $eventSchema = null;

    private const TENDERING = ['recorded', 'pending_confirmation', 'confirmed'];

    /** @return list<string> problems; empty when the event is valid */
    public function validate(stdClass $event): array
    {
        $structure = $this->validateStructure($event);
        if ($structure !== []) {
            return $structure;
        }

        $data = json_decode(json_encode($event, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);

        return match ($data['event_type']) {
            'sale.completed' => $this->validateSale($data),
            'stock.adjusted' => $data['aggregate_id'] === $data['payload']['adjustment_id']
                ? [] : ['aggregate_id: must match the payload identifier'],
            default => ['event_type: unsupported'],
        };
    }

    /** @return list<string> */
    private function validateStructure(stdClass $event): array
    {
        $result = (new Validator)->validate($event, $this->schema());
        if ($result->isValid()) {
            return [];
        }
        $errors = (new ErrorFormatter)->format($result->error(), multiple: false);
        $lines = [];
        foreach ($errors as $path => $message) {
            $lines[] = ($path === '/' ? '' : ltrim((string) $path, '/').': ').$message;
        }

        return array_slice($lines, 0, 5);
    }

    private function schema(): object
    {
        if ($this->eventSchema === null) {
            $push = json_decode((string) file_get_contents(resource_path('schemas/sync-push-request.v1.json')), flags: JSON_THROW_ON_ERROR);
            $this->eventSchema = $push->properties->events->items;
        }

        return $this->eventSchema;
    }

    /**
     * @param  array<string, mixed>  $event
     * @return list<string>
     */
    private function validateSale(array $event): array
    {
        $sale = $event['payload'];
        $issues = [];
        $subtotal = $discount = $tax = $total = 0;
        $sold = [];

        foreach ($sale['lines'] as $i => $line) {
            try {
                $p = Pricing::priceLine(
                    $line['unit_price_minor'], $line['quantity_milli'], $line['discount_minor'],
                    $line['tax']['rate_bp'], $line['tax']['inclusive'], $sale['rounding'],
                );
            } catch (InvalidArgumentException $e) {
                $issues[] = "lines.{$i}: {$e->getMessage()}";

                continue;
            }
            if ($p['taxMinor'] !== $line['tax']['amount_minor']) {
                $issues[] = "lines.{$i}.tax.amount_minor: tax should be {$p['taxMinor']}";
            }
            if ($p['totalMinor'] !== $line['line_total_minor']) {
                $issues[] = "lines.{$i}.line_total_minor: line total should be {$p['totalMinor']}";
            }
            $subtotal += $p['extendedMinor'];
            $discount += $p['discountMinor'];
            $tax += $p['taxMinor'];
            $total += $p['totalMinor'];
            $sold[$line['product_id']] = ($sold[$line['product_id']] ?? 0) + $line['quantity_milli'];
        }

        $t = $sale['totals'];
        foreach (['subtotal_minor' => $subtotal, 'discount_minor' => $discount, 'tax_minor' => $tax, 'total_minor' => $total] as $field => $expected) {
            if ($t[$field] !== $expected) {
                $issues[] = "totals.{$field}: should be {$expected}";
            }
        }

        $tendered = 0;
        foreach ($sale['payments'] as $i => $payment) {
            $converted = $payment['currency'] !== $sale['currency'];
            if ($converted && empty($payment['exchange_rate'])) {
                $issues[] = "payments.{$i}.exchange_rate: required for a payment in another currency";
            }
            if (! $converted && $payment['sale_currency_amount_minor'] !== $payment['amount_minor']) {
                $issues[] = "payments.{$i}.sale_currency_amount_minor: same-currency payment must have equal amounts";
            }
            if (in_array($payment['status'], self::TENDERING, true)) {
                $tendered += $payment['sale_currency_amount_minor'];
            }
        }
        if ($tendered - $sale['change_minor'] !== $t['total_minor']) {
            $issues[] = "payments: tendered ({$tendered}) minus change ({$sale['change_minor']}) must equal total ({$t['total_minor']})";
        }

        $moved = [];
        foreach ($sale['stock_movements'] as $m) {
            $moved[$m['product_id']] = ($moved[$m['product_id']] ?? 0) + $m['quantity_delta_milli'];
        }
        foreach (array_unique([...array_keys($sold), ...array_keys($moved)]) as $productId) {
            if (($moved[$productId] ?? 0) !== -($sold[$productId] ?? 0)) {
                $issues[] = "stock_movements: movements for {$productId} must total ".(-($sold[$productId] ?? 0));
            }
        }

        foreach (['lines' => 'line_id', 'payments' => 'payment_id', 'stock_movements' => 'movement_id'] as $list => $key) {
            $ids = array_column($sale[$list], $key);
            if (count($ids) !== count(array_unique($ids))) {
                $issues[] = "{$list}: {$key} values must be unique";
            }
        }

        if ($event['aggregate_id'] !== $sale['sale_id']) {
            $issues[] = 'aggregate_id: must match the payload identifier';
        }

        return $issues;
    }

    /** sha256 of canonical JSON (object keys sorted), so equal events hash equally regardless of key order. */
    public static function canonicalHash(mixed $value): string
    {
        return hash('sha256', json_encode(self::canonical($value), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private static function canonical(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            $props = get_object_vars($value);
            ksort($props, SORT_STRING);
            $out = new stdClass;
            foreach ($props as $k => $v) {
                $out->{$k} = self::canonical($v);
            }

            return $out;
        }
        if (is_array($value)) {
            return array_map(self::canonical(...), $value);
        }

        return $value;
    }
}
