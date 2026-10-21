<?php

namespace App\Reports;

use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Read-only reports over synced data. Everything is grouped by the business's
 * local day (tenants.timezone). Amounts stay in integer minor units and in the
 * currency they were recorded in; nothing is converted here.
 *
 * Totals come from what tills recorded. A payment's status is reported as
 * recorded; it never implies the money has settled.
 */
final class Reports
{
    public const MAX_DAYS = 92;

    private function context(): TenantContext
    {
        return app(TenantContext::class);
    }

    private function tenantId(): string
    {
        return $this->context()->id();
    }

    public function timezone(): string
    {
        return $this->context()->tenant()->timezone ?: 'Africa/Harare';
    }

    /**
     * Local days from..to inclusive, as a UTC [start, end) window.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public function window(string $from, string $to): array
    {
        $tz = $this->timezone();

        return [
            CarbonImmutable::parse($from, $tz)->startOfDay()->utc(),
            CarbonImmutable::parse($to, $tz)->addDay()->startOfDay()->utc(),
        ];
    }

    private function localDay(string $utc): string
    {
        return CarbonImmutable::parse($utc, 'UTC')->setTimezone($this->timezone())->toDateString();
    }

    /** @return list<string> */
    private function days(string $from, string $to): array
    {
        $days = [];
        for ($d = CarbonImmutable::parse($from); $d->lte(CarbonImmutable::parse($to)); $d = $d->addDay()) {
            $days[] = $d->toDateString();
        }

        return $days;
    }

    private function sales(CarbonImmutable $start, CarbonImmutable $end, ?string $branchId): Collection
    {
        return DB::table('sales')->where('tenant_id', $this->tenantId())
            ->where('completed_at', '>=', $start)->where('completed_at', '<', $end)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get(['id', 'register_id', 'actor_user_id', 'receipt_number', 'currency', 'tax_minor', 'total_minor', 'discount_minor', 'change_minor', 'completed_at']);
    }

    private function refunds(CarbonImmutable $start, CarbonImmutable $end, ?string $branchId): Collection
    {
        return DB::table('refunds')->where('tenant_id', $this->tenantId())
            ->where('refunded_at', '>=', $start)->where('refunded_at', '<', $end)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get(['id', 'reason', 'currency', 'tax_minor', 'total_minor', 'refunded_at']);
    }

    /** @return array<string, mixed> */
    public function salesSummary(string $from, string $to, ?string $branchId = null): array
    {
        [$start, $end] = $this->window($from, $to);
        $sales = $this->sales($start, $end, $branchId);
        $refunds = $this->refunds($start, $end, $branchId);

        $byDay = [];
        foreach ($this->days($from, $to) as $day) {
            $byDay[$day] = ['date' => $day, 'sales_count' => 0, 'sales_minor' => 0, 'tax_minor' => 0, 'discount_minor' => 0, 'refunds_count' => 0, 'refunds_minor' => 0, 'refund_tax_minor' => 0];
        }
        foreach ($sales as $s) {
            $d = &$byDay[$this->localDay($s->completed_at)];
            $d['sales_count']++;
            $d['sales_minor'] += (int) $s->total_minor;
            $d['tax_minor'] += (int) $s->tax_minor;
            $d['discount_minor'] += (int) $s->discount_minor;
            unset($d);
        }
        foreach ($refunds as $r) {
            $d = &$byDay[$this->localDay($r->refunded_at)];
            $d['refunds_count']++;
            $d['refunds_minor'] += (int) $r->total_minor;
            $d['refund_tax_minor'] += (int) $r->tax_minor;
            unset($d);
        }
        $rows = array_values(array_map(fn ($d) => [...$d, 'net_minor' => $d['sales_minor'] - $d['refunds_minor']], $byDay));
        $sum = fn (string $k) => array_sum(array_column($rows, $k));

        return [
            'from' => $from, 'to' => $to, 'timezone' => $this->timezone(),
            'currency' => $this->context()->tenant()->base_currency,
            'days' => $rows,
            'totals' => [
                'sales_count' => $sum('sales_count'), 'sales_minor' => $sum('sales_minor'), 'tax_minor' => $sum('tax_minor'),
                'discount_minor' => $sum('discount_minor'), 'refunds_count' => $sum('refunds_count'), 'refunds_minor' => $sum('refunds_minor'),
                'refund_tax_minor' => $sum('refund_tax_minor'), 'net_minor' => $sum('net_minor'),
                'average_sale_minor' => $sum('sales_count') > 0 ? intdiv($sum('sales_minor'), $sum('sales_count')) : 0,
            ],
            'payments' => $this->paymentsBreakdown($sales->pluck('id')->all(), $refunds->pluck('id')->all()),
            'change_given_minor' => (int) $sales->sum('change_minor'),
            'by_cashier' => $this->byPerson($sales),
            'by_register' => $this->byRegister($sales),
        ];
    }

    /**
     * Tendered per payment type and currency, refunds paid out the same way,
     * and how much of each is still awaiting confirmation.
     *
     * @param  list<string>  $saleIds
     * @param  list<string>  $refundIds
     * @return list<array<string, mixed>>
     */
    private function paymentsBreakdown(array $saleIds, array $refundIds): array
    {
        $rows = [];
        $key = fn ($code, $currency) => "{$code}|{$currency}";
        $names = DB::table('payment_methods')->where('tenant_id', $this->tenantId())->pluck('name', 'code');
        foreach (array_chunk($saleIds, 500) as $chunk) {
            foreach (DB::table('sale_payments')->where('tenant_id', $this->tenantId())->whereIn('sale_id', $chunk)->get() as $p) {
                $k = $key($p->method_code, $p->currency);
                $rows[$k] ??= ['method_code' => $p->method_code, 'name' => $names[$p->method_code] ?? $p->method_code, 'currency' => $p->currency, 'count' => 0, 'tendered_minor' => 0, 'pending_minor' => 0, 'refunded_minor' => 0];
                $rows[$k]['count']++;
                $rows[$k]['tendered_minor'] += (int) $p->amount_minor;
                if ($p->status === 'pending_confirmation') {
                    $rows[$k]['pending_minor'] += (int) $p->amount_minor;
                }
            }
        }
        foreach (array_chunk($refundIds, 500) as $chunk) {
            foreach (DB::table('refund_payments')->where('tenant_id', $this->tenantId())->whereIn('refund_id', $chunk)->get() as $p) {
                $k = $key($p->method_code, $p->currency);
                $rows[$k] ??= ['method_code' => $p->method_code, 'name' => $names[$p->method_code] ?? $p->method_code, 'currency' => $p->currency, 'count' => 0, 'tendered_minor' => 0, 'pending_minor' => 0, 'refunded_minor' => 0];
                $rows[$k]['refunded_minor'] += (int) $p->amount_minor;
            }
        }
        ksort($rows);

        return array_values($rows);
    }

    /** @return list<array<string, mixed>> */
    private function byPerson(Collection $sales): array
    {
        $names = DB::table('users')->whereIn('id', $sales->pluck('actor_user_id')->unique()->all())->pluck('name', 'id');

        return $sales->groupBy('actor_user_id')->map(fn ($group, $userId) => [
            'user_id' => $userId, 'name' => $names[$userId] ?? 'Unknown (device)', 'sales_count' => $group->count(), 'sales_minor' => (int) $group->sum('total_minor'),
        ])->sortByDesc('sales_minor')->values()->all();
    }

    /** @return list<array<string, mixed>> */
    private function byRegister(Collection $sales): array
    {
        $names = DB::table('registers')->where('tenant_id', $this->tenantId())->pluck('name', 'id');

        return $sales->groupBy('register_id')->map(fn ($group, $registerId) => [
            'register_id' => $registerId, 'name' => $names[$registerId] ?? $registerId, 'sales_count' => $group->count(), 'sales_minor' => (int) $group->sum('total_minor'),
        ])->sortByDesc('sales_minor')->values()->all();
    }

    /**
     * Tax by code and rate: what was charged on sales, less what refunds gave
     * back. Line totals include tax, so taxable = total − tax.
     *
     * @return array<string, mixed>
     */
    public function vat(string $from, string $to, ?string $branchId = null): array
    {
        [$start, $end] = $this->window($from, $to);
        $rows = [];
        $add = function (string $code, int $rate, int $total, int $tax, int $sign) use (&$rows) {
            $k = "{$code}|{$rate}";
            $rows[$k] ??= ['tax_code' => $code, 'rate_bp' => $rate, 'sales_total_minor' => 0, 'sales_tax_minor' => 0, 'refunds_total_minor' => 0, 'refunds_tax_minor' => 0];
            $rows[$k][$sign > 0 ? 'sales_total_minor' : 'refunds_total_minor'] += $total;
            $rows[$k][$sign > 0 ? 'sales_tax_minor' : 'refunds_tax_minor'] += $tax;
        };

        DB::table('sale_lines')->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->where('sales.tenant_id', $this->tenantId())->where('sales.completed_at', '>=', $start)->where('sales.completed_at', '<', $end)
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->groupBy('sale_lines.tax_code', 'sale_lines.tax_rate_bp')
            ->selectRaw('sale_lines.tax_code, sale_lines.tax_rate_bp, SUM(sale_lines.line_total_minor) AS total, SUM(sale_lines.tax_minor) AS tax')
            ->get()->each(fn ($r) => $add($r->tax_code, (int) $r->tax_rate_bp, (int) $r->total, (int) $r->tax, 1));

        DB::table('refund_lines')->join('refunds', 'refunds.id', '=', 'refund_lines.refund_id')
            ->join('sale_lines', 'sale_lines.id', '=', 'refund_lines.original_line_id')
            ->where('refunds.tenant_id', $this->tenantId())->where('refunds.refunded_at', '>=', $start)->where('refunds.refunded_at', '<', $end)
            ->when($branchId, fn ($q) => $q->where('refunds.branch_id', $branchId))
            ->groupBy('sale_lines.tax_code', 'sale_lines.tax_rate_bp')
            ->selectRaw('sale_lines.tax_code, sale_lines.tax_rate_bp, SUM(refund_lines.amount_minor) AS total, SUM(refund_lines.tax_minor) AS tax')
            ->get()->each(fn ($r) => $add($r->tax_code, (int) $r->tax_rate_bp, (int) $r->total, (int) $r->tax, -1));

        ksort($rows);
        $lines = array_values(array_map(fn ($r) => [
            ...$r,
            'net_taxable_minor' => ($r['sales_total_minor'] - $r['sales_tax_minor']) - ($r['refunds_total_minor'] - $r['refunds_tax_minor']),
            'net_tax_minor' => $r['sales_tax_minor'] - $r['refunds_tax_minor'],
        ], $rows));

        return [
            'from' => $from, 'to' => $to, 'currency' => $this->context()->tenant()->base_currency,
            'lines' => $lines,
            'net_tax_minor' => array_sum(array_column($lines, 'net_tax_minor')),
            'net_taxable_minor' => array_sum(array_column($lines, 'net_taxable_minor')),
            'notice' => 'Not a tax return. Figures come from synced till records; check them before filing.',
        ];
    }

    /** @return list<array<string, mixed>> */
    public function topProducts(string $from, string $to, ?string $branchId = null, int $limit = 20): array
    {
        [$start, $end] = $this->window($from, $to);

        return DB::table('sale_lines')->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->where('sales.tenant_id', $this->tenantId())->where('sales.completed_at', '>=', $start)->where('sales.completed_at', '<', $end)
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->groupBy('sale_lines.product_id', 'sale_lines.name')
            ->selectRaw('sale_lines.product_id, sale_lines.name, SUM(sale_lines.quantity_milli) AS qty, SUM(sale_lines.line_total_minor) AS total')
            ->orderByDesc('total')->limit($limit)->get()
            ->map(fn ($r) => ['product_id' => $r->product_id, 'name' => $r->name, 'quantity_milli' => (int) $r->qty, 'sales_minor' => (int) $r->total])
            ->values()->all();
    }

    /**
     * Shifts that opened in the window, newest first, with sales and the
     * cash count. Variance is counted − expected per currency.
     *
     * @return list<array<string, mixed>>
     */
    public function shifts(string $from, string $to, ?string $branchId = null): array
    {
        [$start, $end] = $this->window($from, $to);
        $shifts = DB::table('shifts')->where('tenant_id', $this->tenantId())->where('opened_at', '>=', $start)->where('opened_at', '<', $end)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->orderByDesc('opened_at')->limit(200)->get();
        $registers = DB::table('registers')->where('tenant_id', $this->tenantId())->pluck('name', 'id');
        $people = DB::table('users')->whereIn('id', $shifts->pluck('opened_by_user_id')->unique()->all())->pluck('name', 'id');
        $totals = DB::table('sales')->where('tenant_id', $this->tenantId())->whereIn('shift_id', $shifts->pluck('id')->all())
            ->groupBy('shift_id')->selectRaw('shift_id, COUNT(*) AS n, SUM(total_minor) AS total')->get()->keyBy('shift_id');

        return $shifts->map(fn ($s) => [
            'shift_id' => $s->id, 'register' => $registers[$s->register_id] ?? $s->register_id, 'opened_by' => $people[$s->opened_by_user_id] ?? 'Unknown (device)',
            'opened_at' => CarbonImmutable::parse($s->opened_at, 'UTC')->toIso8601String(),
            'closed_at' => $s->closed_at ? CarbonImmutable::parse($s->closed_at, 'UTC')->toIso8601String() : null,
            'sales_count' => (int) ($totals[$s->id]->n ?? 0), 'sales_minor' => (int) ($totals[$s->id]->total ?? 0),
            'variance' => $this->variance(json_decode($s->expected_cash ?? 'null', true), json_decode($s->counted_cash ?? 'null', true)),
        ])->values()->all();
    }

    /**
     * End-of-shift (Z) report: everything the shift took, paid out and moved,
     * with the expected and counted cash the till recorded.
     *
     * @return array<string, mixed>|null
     */
    public function shiftReport(string $shiftId): ?array
    {
        $shift = DB::table('shifts')->where('tenant_id', $this->tenantId())->where('id', $shiftId)->first();
        if (! $shift) {
            return null;
        }
        $sales = DB::table('sales')->where('tenant_id', $this->tenantId())->where('shift_id', $shiftId)->get(['id', 'total_minor', 'tax_minor', 'discount_minor', 'change_minor']);
        $refunds = DB::table('refunds')->where('tenant_id', $this->tenantId())->where('shift_id', $shiftId)->get(['id', 'reason', 'total_minor', 'tax_minor']);
        $movements = DB::table('cash_movements')->where('tenant_id', $this->tenantId())->where('shift_id', $shiftId)->orderBy('occurred_at')
            ->get(['direction', 'currency', 'amount_minor', 'reason', 'note', 'occurred_at']);
        $expected = json_decode($shift->expected_cash ?? 'null', true);
        $counted = json_decode($shift->counted_cash ?? 'null', true);

        return [
            'shift_id' => $shift->id,
            'register' => DB::table('registers')->where('id', $shift->register_id)->value('name'),
            'opened_by' => DB::table('users')->where('id', $shift->opened_by_user_id)->value('name') ?? 'Unknown (device)',
            'closed_by' => $shift->closed_by_user_id ? (DB::table('users')->where('id', $shift->closed_by_user_id)->value('name') ?? 'Unknown (device)') : null,
            'opened_at' => CarbonImmutable::parse($shift->opened_at, 'UTC')->toIso8601String(),
            'closed_at' => $shift->closed_at ? CarbonImmutable::parse($shift->closed_at, 'UTC')->toIso8601String() : null,
            'opening_float' => json_decode($shift->opening_float, true),
            'sales_count' => $sales->count(),
            'sales_minor' => (int) $sales->sum('total_minor'),
            'tax_minor' => (int) $sales->sum('tax_minor'),
            'discount_minor' => (int) $sales->sum('discount_minor'),
            'change_given_minor' => (int) $sales->sum('change_minor'),
            'refunds_count' => $refunds->count(),
            'voids_count' => $refunds->where('reason', 'void')->count(),
            'refunds_minor' => (int) $refunds->sum('total_minor'),
            'payments' => $this->paymentsBreakdown($sales->pluck('id')->all(), $refunds->pluck('id')->all()),
            'cash_movements' => $movements->map(fn ($m) => [
                'direction' => $m->direction, 'currency' => $m->currency, 'amount_minor' => (int) $m->amount_minor, 'reason' => $m->reason,
                'note' => $m->note, 'occurred_at' => CarbonImmutable::parse($m->occurred_at, 'UTC')->toIso8601String(),
            ])->values()->all(),
            'expected_cash' => $expected,
            'counted_cash' => $counted,
            'variance' => $this->variance($expected, $counted),
            'note' => $shift->note,
        ];
    }

    /**
     * @param  list<array{currency: string, amount_minor: int}>|null  $expected
     * @param  list<array{currency: string, amount_minor: int}>|null  $counted
     * @return list<array{currency: string, amount_minor: int}>|null
     */
    private function variance(?array $expected, ?array $counted): ?array
    {
        if ($expected === null || $counted === null) {
            return null;
        }
        $e = array_column($expected, 'amount_minor', 'currency');
        $c = array_column($counted, 'amount_minor', 'currency');
        $currencies = array_unique([...array_keys($e), ...array_keys($c)]);
        sort($currencies);

        return array_map(fn ($cur) => ['currency' => $cur, 'amount_minor' => ($c[$cur] ?? 0) - ($e[$cur] ?? 0)], $currencies);
    }

    /**
     * An estimate of profit for the period, in the base currency.
     *
     * Cost of goods is quantity × each product's current last cost (not the
     * cost when sold), so it is an estimate; lines whose product has no cost
     * are counted separately rather than guessed. Expenses in other
     * currencies are listed, not converted.
     *
     * @return array<string, mixed>
     */
    public function profit(string $from, string $to, ?string $branchId = null): array
    {
        [$start, $end] = $this->window($from, $to);
        $base = $this->context()->tenant()->base_currency;
        $summary = $this->salesSummary($from, $to, $branchId)['totals'];
        $netSales = ($summary['sales_minor'] - $summary['tax_minor']) - ($summary['refunds_minor'] - $summary['refund_tax_minor']);

        $sold = DB::table('sale_lines')->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->leftJoin('products', 'products.id', '=', 'sale_lines.product_id')
            ->where('sales.tenant_id', $this->tenantId())->where('sales.completed_at', '>=', $start)->where('sales.completed_at', '<', $end)
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->get(['sale_lines.quantity_milli', 'sale_lines.line_total_minor', 'products.cost_minor']);
        $returned = DB::table('refund_lines')->join('refunds', 'refunds.id', '=', 'refund_lines.refund_id')
            ->leftJoin('products', 'products.id', '=', 'refund_lines.product_id')
            ->where('refunds.tenant_id', $this->tenantId())->where('refunds.refunded_at', '>=', $start)->where('refunds.refunded_at', '<', $end)
            ->where('refund_lines.restock', true)
            ->when($branchId, fn ($q) => $q->where('refunds.branch_id', $branchId))
            ->get(['refund_lines.quantity_milli', 'products.cost_minor']);

        $cost = fn ($lines) => (int) $lines->filter(fn ($l) => $l->cost_minor !== null)->sum(fn ($l) => intdiv($l->quantity_milli * $l->cost_minor + 500, 1000));
        $uncosted = $sold->filter(fn ($l) => $l->cost_minor === null);
        $cogs = $cost($sold) - $cost($returned);

        $expenses = DB::table('expenses')->where('tenant_id', $this->tenantId())->where('spent_at', '>=', $start)->where('spent_at', '<', $end)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->groupBy('currency')->selectRaw('currency, SUM(amount_minor) AS total')->pluck('total', 'currency')->map(fn ($v) => (int) $v);
        $drawer = DB::table('cash_movements')->where('tenant_id', $this->tenantId())->where('reason', 'expense')->where('direction', 'out')
            ->where('occurred_at', '>=', $start)->where('occurred_at', '<', $end)
            // Cash movements belong to a shift, and the shift to a branch.
            ->when($branchId, fn ($q) => $q->whereIn('shift_id', DB::table('shifts')->where('branch_id', $branchId)->select('id')))
            ->groupBy('currency')->selectRaw('currency, SUM(amount_minor) AS total')->pluck('total', 'currency')->map(fn ($v) => (int) $v);
        $baseExpenses = ($expenses[$base] ?? 0) + ($drawer[$base] ?? 0);
        $other = collect([...$expenses->keys(), ...$drawer->keys()])->unique()->reject(fn ($c) => $c === $base)
            ->map(fn ($c) => ['currency' => $c, 'amount_minor' => ($expenses[$c] ?? 0) + ($drawer[$c] ?? 0)])->values()->all();

        return [
            'from' => $from, 'to' => $to, 'currency' => $base,
            'net_sales_minor' => $netSales,
            'cost_of_goods_minor' => $cogs,
            'gross_profit_minor' => $netSales - $cogs,
            'expenses_minor' => $baseExpenses,
            'net_profit_minor' => $netSales - $cogs - $baseExpenses,
            'uncosted_lines' => $uncosted->count(),
            'uncosted_sales_minor' => (int) $uncosted->sum('line_total_minor'),
            'expenses_in_other_currencies' => $other,
            'notice' => 'Estimate: cost of goods uses each product’s current last cost, and sales of products without a cost are left out of it.',
        ];
    }
}
