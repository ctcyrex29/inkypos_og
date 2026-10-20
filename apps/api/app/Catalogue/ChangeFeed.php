<?php

namespace App\Catalogue;

use App\Models\Branch;
use App\Models\ExchangeRate;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Register;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Paged reference-data feed for tills.
 *
 * Cursor (opaque to clients):
 *   ""                     start: snapshot everything current
 *   snap:<seq>:<after-id>  snapshot in progress (products paged by id); <seq> = log position when it began
 *   log:<seq>              follow the change log after <seq>
 *
 * A snapshot followed by the log from where the snapshot began cannot miss a
 * change made while the snapshot was paging; at worst an entity is sent twice.
 */
final class ChangeFeed
{
    public const MAX_LIMIT = 500;

    public function __construct(
        private readonly Catalogue $catalogue,
    ) {}

    /** Resolved on every use: controllers, services and middleware can outlive a request (route caching, Octane). */
    private function context(): TenantContext
    {
        return app(TenantContext::class);
    }

    /** @return array{next_cursor: string, has_more: bool, changes: list<array<string, mixed>>} */
    public function page(string $cursor, int $limit): array
    {
        $limit = max(1, min($limit, self::MAX_LIMIT));

        if ($cursor === '' || $cursor === '0') {
            return $this->snapshot($this->logHead(), '', $limit);
        }
        if (preg_match('/^snap:(\d+):([0-9a-f-]*)$/', $cursor, $m) === 1) {
            return $this->snapshot((int) $m[1], $m[2], $limit);
        }
        if (preg_match('/^log:(\d+)$/', $cursor, $m) === 1) {
            return $this->log((int) $m[1], $limit);
        }

        throw new InvalidArgumentException('Unknown cursor');
    }

    private function logHead(): int
    {
        return (int) DB::table('catalogue_changes')->where('tenant_id', $this->context()->id())->max('seq');
    }

    private function snapshot(int $head, string $afterProductId, int $limit): array
    {
        $changes = [];
        if ($afterProductId === '') {
            $changes[] = $this->upsert('business', $this->catalogue->business($this->context()->tenant()));
            foreach (Branch::orderBy('code')->get() as $b) {
                $changes[] = $this->upsert('branch', $this->catalogue->branch($b));
            }
            foreach (Register::orderBy('code')->get() as $r) {
                $changes[] = $this->upsert('register', $this->catalogue->register($r));
            }
            foreach (PaymentMethod::orderBy('position')->get() as $m) {
                $changes[] = $this->upsert('payment_method', $this->catalogue->paymentMethod($m));
            }
            // Only the newest rate per currency pair matters to a till.
            $latest = ExchangeRate::orderByDesc('version')->get()->unique(fn ($r) => $r->base_currency.$r->quote_currency);
            foreach ($latest as $r) {
                $changes[] = $this->upsert('exchange_rate', $this->catalogue->exchangeRate($r));
            }
        }

        $products = Product::where('id', '>', $afterProductId)->orderBy('id')->limit($limit)->get();
        foreach ($products as $p) {
            $changes[] = $this->upsert('product', $this->catalogue->product($p));
        }

        $done = $products->count() < $limit;

        return [
            'next_cursor' => $done ? "log:{$head}" : "snap:{$head}:{$products->last()->id}",
            'has_more' => true, // after a snapshot the log may already hold newer changes
            'changes' => $changes,
        ];
    }

    private function log(int $after, int $limit): array
    {
        $rows = DB::table('catalogue_changes')
            ->where('tenant_id', $this->context()->id())
            ->where('seq', '>', $after)
            ->orderBy('seq')
            ->limit($limit)
            ->get();

        // Several changes to one entity in a page collapse to its current state.
        $latest = [];
        foreach ($rows as $row) {
            $latest[$row->entity.':'.$row->entity_id] = $row;
        }
        uasort($latest, fn ($a, $b) => $a->seq <=> $b->seq);

        $changes = [];
        foreach ($latest as $row) {
            $data = $this->catalogue->current($row->entity, $row->entity_id);
            $changes[] = $data === null
                ? ['entity' => $row->entity, 'op' => 'delete', 'id' => $row->entity_id, 'version' => 1, 'data' => null]
                : $this->upsert($row->entity, $data);
        }

        return [
            'next_cursor' => 'log:'.($rows->last()->seq ?? $after),
            'has_more' => $rows->count() === $limit,
            'changes' => $changes,
        ];
    }

    /** @param array<string, mixed> $data */
    private function upsert(string $entity, array $data): array
    {
        return [
            'entity' => $entity,
            'op' => 'upsert',
            'id' => $data['product_id'] ?? $data['id'],
            'version' => max(1, (int) ($data['version'] ?? 1)),
            'data' => $data,
        ];
    }
}
