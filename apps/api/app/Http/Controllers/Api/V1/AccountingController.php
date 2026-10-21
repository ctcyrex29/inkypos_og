<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Reports\Reports;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Money that does not pass through a till: expenses and payments to
 * suppliers, plus the cash book and supplier balances built from everything
 * recorded. Entries are never edited; a mistake is corrected by recording
 * the opposite entry, so the history stays complete.
 */
class AccountingController extends Controller
{
    public const EXPENSE_CATEGORIES = ['rent', 'utilities', 'wages', 'transport', 'supplies', 'repairs', 'fees', 'other'];

    public const PAID_FROM = ['bank', 'mobile_money', 'cash_office', 'other'];

    public const CURRENCIES = ['USD', 'ZWG', 'ZAR', 'BWP'];

    public function __construct(
        private readonly Reports $reports,
    ) {}

    private function tenantId(): string
    {
        return app(TenantContext::class)->id();
    }

    /** @return array{from: string, to: string} */
    private function period(Request $request): array
    {
        $data = $request->validate(['from' => ['required', 'date_format:Y-m-d'], 'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from']]);
        if (CarbonImmutable::parse($data['from'])->diffInDays(CarbonImmutable::parse($data['to'])) >= Reports::MAX_DAYS) {
            throw new ApiException('validation_failed', 'Choose a period of at most '.Reports::MAX_DAYS.' days.', 422);
        }

        return $data;
    }

    // ── Expenses ─────────────────────────────────────────────────────────────

    public function expenses(Request $request): JsonResponse
    {
        ['from' => $from, 'to' => $to] = $this->period($request);
        [$start, $end] = $this->reports->window($from, $to);
        $rows = DB::table('expenses')->where('tenant_id', $this->tenantId())->where('spent_at', '>=', $start)->where('spent_at', '<', $end)
            ->orderByDesc('spent_at')->get();

        return ApiResponse::ok($rows->map(fn ($e) => $this->expensePayload($e))->values());
    }

    public function storeExpense(Request $request): JsonResponse
    {
        $tenantId = $this->tenantId();
        $data = $request->validate([
            'branch_id' => ['nullable', 'uuid', Rule::exists('branches', 'id')->where('tenant_id', $tenantId)],
            'category' => ['required', Rule::in(self::EXPENSE_CATEGORIES)],
            'description' => ['required', 'string', 'max:200'],
            'currency' => ['required', Rule::in(self::CURRENCIES)],
            // Negative only to reverse an earlier entry.
            'amount_minor' => ['required', 'integer', 'not_in:0', 'between:-999999999999,999999999999'],
            'paid_from' => ['required', Rule::in(self::PAID_FROM)],
            'reference' => ['nullable', 'string', 'max:64'],
            'spent_at' => ['nullable', 'date', 'before_or_equal:now'],
        ]);
        $row = [
            'id' => (string) Str::uuid7(), 'tenant_id' => $tenantId, 'branch_id' => $data['branch_id'] ?? null, 'category' => $data['category'],
            'description' => $data['description'], 'currency' => $data['currency'], 'amount_minor' => $data['amount_minor'], 'paid_from' => $data['paid_from'],
            'reference' => $data['reference'] ?? null, 'spent_at' => isset($data['spent_at']) ? CarbonImmutable::parse($data['spent_at'])->utc() : now(),
            'recorded_by_user_id' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
        ];
        DB::transaction(function () use ($row) {
            DB::table('expenses')->insert($row);
            Audit::record('expense.recorded', null, ['expense_id' => $row['id'], 'amount_minor' => $row['amount_minor'], 'currency' => $row['currency']]);
        });

        return ApiResponse::ok($this->expensePayload((object) $row), 201);
    }

    /** @return array<string, mixed> */
    private function expensePayload(object $e): array
    {
        return [
            'id' => $e->id, 'branch_id' => $e->branch_id, 'category' => $e->category, 'description' => $e->description, 'currency' => $e->currency,
            'amount_minor' => (int) $e->amount_minor, 'paid_from' => $e->paid_from, 'reference' => $e->reference,
            'spent_at' => CarbonImmutable::parse($e->spent_at, 'UTC')->toIso8601String(),
        ];
    }

    // ── Suppliers: payments and balances ─────────────────────────────────────

    public function storeSupplierPayment(Request $request): JsonResponse
    {
        $tenantId = $this->tenantId();
        $data = $request->validate([
            'supplier_id' => ['required', 'uuid', Rule::exists('suppliers', 'id')->where('tenant_id', $tenantId)],
            'currency' => ['required', Rule::in(self::CURRENCIES)],
            'amount_minor' => ['required', 'integer', 'not_in:0', 'between:-999999999999,999999999999'],
            'paid_from' => ['required', Rule::in(self::PAID_FROM)],
            'reference' => ['nullable', 'string', 'max:64'],
            'paid_at' => ['nullable', 'date', 'before_or_equal:now'],
        ]);
        $row = [
            'id' => (string) Str::uuid7(), 'tenant_id' => $tenantId, 'supplier_id' => $data['supplier_id'], 'currency' => $data['currency'],
            'amount_minor' => $data['amount_minor'], 'paid_from' => $data['paid_from'], 'reference' => $data['reference'] ?? null,
            'paid_at' => isset($data['paid_at']) ? CarbonImmutable::parse($data['paid_at'])->utc() : now(),
            'recorded_by_user_id' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
        ];
        DB::transaction(function () use ($row) {
            DB::table('supplier_payments')->insert($row);
            Audit::record('supplier.paid', null, ['supplier_id' => $row['supplier_id'], 'amount_minor' => $row['amount_minor'], 'currency' => $row['currency']]);
        });

        return ApiResponse::ok([
            'id' => $row['id'], 'supplier_id' => $row['supplier_id'], 'currency' => $row['currency'], 'amount_minor' => $row['amount_minor'],
            'paid_from' => $row['paid_from'], 'reference' => $row['reference'], 'paid_at' => $row['paid_at']->toIso8601String(),
        ], 201);
    }

    /**
     * What is owed to each supplier: deliveries (in the base currency) less
     * payments in that currency. Payments in other currencies are listed
     * separately, not converted.
     */
    public function supplierBalances(): JsonResponse
    {
        $tenantId = $this->tenantId();
        $base = app(TenantContext::class)->tenant()->base_currency;
        $received = DB::table('purchases')->where('tenant_id', $tenantId)->groupBy('supplier_id')->selectRaw('supplier_id, SUM(total_cost_minor) AS total')->pluck('total', 'supplier_id');
        $paid = DB::table('supplier_payments')->where('tenant_id', $tenantId)->groupBy('supplier_id', 'currency')
            ->selectRaw('supplier_id, currency, SUM(amount_minor) AS total')->get()->groupBy('supplier_id');

        $rows = DB::table('suppliers')->where('tenant_id', $tenantId)->orderBy('name')->get(['id', 'name', 'active'])->map(function ($s) use ($received, $paid, $base) {
            $payments = ($paid[$s->id] ?? collect())->pluck('total', 'currency')->map(fn ($v) => (int) $v);
            $deliveries = (int) ($received[$s->id] ?? 0);

            return [
                'supplier_id' => $s->id, 'name' => $s->name, 'active' => (bool) $s->active,
                'deliveries_minor' => $deliveries, 'paid_minor' => $payments[$base] ?? 0, 'balance_minor' => $deliveries - ($payments[$base] ?? 0),
                'paid_in_other_currencies' => $payments->except([$base])->map(fn ($v, $c) => ['currency' => $c, 'amount_minor' => $v])->values()->all(),
            ];
        });

        return ApiResponse::ok(['currency' => $base, 'suppliers' => $rows->values()]);
    }

    // ── Cash book ────────────────────────────────────────────────────────────

    /**
     * Every money movement in the period, by local day: till takings per
     * payment type (one line per day), change given, refunds paid out, drawer
     * cash in/out, expenses and supplier payments. Pending payments are
     * included as recorded and marked.
     */
    public function cashbook(Request $request): JsonResponse
    {
        ['from' => $from, 'to' => $to] = $this->period($request);
        [$start, $end] = $this->reports->window($from, $to);
        $tenantId = $this->tenantId();
        $tz = $this->reports->timezone();
        $day = fn ($utc) => CarbonImmutable::parse($utc, 'UTC')->setTimezone($tz)->toDateString();
        $names = DB::table('payment_methods')->where('tenant_id', $tenantId)->pluck('name', 'code');
        $entries = [];
        $add = function (string $date, string $kind, string $description, string $method, string $currency, int $in, int $out, int $pending = 0) use (&$entries) {
            $entries[] = ['date' => $date, 'kind' => $kind, 'description' => $description, 'method' => $method, 'currency' => $currency, 'in_minor' => $in, 'out_minor' => $out, 'pending_minor' => $pending];
        };

        // Takings: one line per day, payment type and currency.
        $takings = [];
        DB::table('sale_payments')->join('sales', 'sales.id', '=', 'sale_payments.sale_id')
            ->where('sales.tenant_id', $tenantId)->where('sales.completed_at', '>=', $start)->where('sales.completed_at', '<', $end)
            ->get(['sales.completed_at', 'sale_payments.method_code', 'sale_payments.currency', 'sale_payments.amount_minor', 'sale_payments.status'])
            ->each(function ($p) use (&$takings, $day) {
                $k = $day($p->completed_at).'|'.$p->method_code.'|'.$p->currency;
                $takings[$k] ??= ['amount' => 0, 'pending' => 0, 'count' => 0];
                $takings[$k]['amount'] += (int) $p->amount_minor;
                $takings[$k]['pending'] += $p->status === 'pending_confirmation' ? (int) $p->amount_minor : 0;
                $takings[$k]['count']++;
            });
        foreach ($takings as $k => $t) {
            [$date, $code, $currency] = explode('|', $k);
            $add($date, 'takings', "Sales: {$t['count']} payments", $names[$code] ?? $code, $currency, $t['amount'], 0, $t['pending']);
        }

        // Change handed back comes out of the drawer in the sale currency.
        DB::table('sales')->where('tenant_id', $tenantId)->where('completed_at', '>=', $start)->where('completed_at', '<', $end)->where('change_minor', '>', 0)
            ->get(['completed_at', 'currency', 'change_minor'])->groupBy(fn ($s) => $day($s->completed_at).'|'.$s->currency)
            ->each(function ($g, $k) use ($add, $names) {
                [$date, $currency] = explode('|', $k);
                $add($date, 'change', 'Change given', $names['cash'] ?? 'Cash', $currency, 0, (int) $g->sum('change_minor'));
            });

        DB::table('refund_payments')->join('refunds', 'refunds.id', '=', 'refund_payments.refund_id')
            ->where('refunds.tenant_id', $tenantId)->where('refunds.refunded_at', '>=', $start)->where('refunds.refunded_at', '<', $end)
            ->get(['refunds.refunded_at', 'refunds.receipt_number', 'refunds.reason', 'refund_payments.method_code', 'refund_payments.currency', 'refund_payments.amount_minor'])
            ->each(fn ($r) => $add($day($r->refunded_at), 'refund', ($r->reason === 'void' ? 'Void ' : 'Refund ').$r->receipt_number, $names[$r->method_code] ?? $r->method_code, $r->currency, 0, (int) $r->amount_minor));

        DB::table('cash_movements')->where('tenant_id', $tenantId)->where('occurred_at', '>=', $start)->where('occurred_at', '<', $end)
            ->get(['occurred_at', 'direction', 'currency', 'amount_minor', 'reason', 'note'])
            ->each(fn ($m) => $add(
                $day($m->occurred_at), 'drawer', 'Till '.str_replace('_', ' ', $m->reason).($m->note ? ": {$m->note}" : ''), $names['cash'] ?? 'Cash', $m->currency,
                $m->direction === 'in' ? (int) $m->amount_minor : 0, $m->direction === 'out' ? (int) $m->amount_minor : 0,
            ));

        DB::table('expenses')->where('tenant_id', $tenantId)->where('spent_at', '>=', $start)->where('spent_at', '<', $end)
            ->get(['spent_at', 'category', 'description', 'paid_from', 'currency', 'amount_minor'])
            ->each(fn ($e) => $add($day($e->spent_at), 'expense', ucfirst($e->category).": {$e->description}", str_replace('_', ' ', $e->paid_from), $e->currency, 0, (int) $e->amount_minor));

        DB::table('supplier_payments')->join('suppliers', 'suppliers.id', '=', 'supplier_payments.supplier_id')
            ->where('supplier_payments.tenant_id', $tenantId)->where('supplier_payments.paid_at', '>=', $start)->where('supplier_payments.paid_at', '<', $end)
            ->get(['supplier_payments.paid_at', 'suppliers.name', 'supplier_payments.paid_from', 'supplier_payments.currency', 'supplier_payments.amount_minor', 'supplier_payments.reference'])
            ->each(fn ($p) => $add($day($p->paid_at), 'supplier', "Paid {$p->name}".($p->reference ? " ({$p->reference})" : ''), str_replace('_', ' ', $p->paid_from), $p->currency, 0, (int) $p->amount_minor));

        $order = ['takings' => 0, 'change' => 1, 'refund' => 2, 'drawer' => 3, 'expense' => 4, 'supplier' => 5];
        usort($entries, fn ($a, $b) => [$a['date'], $order[$a['kind']]] <=> [$b['date'], $order[$b['kind']]]);
        $totals = collect($entries)->groupBy('currency')->map(fn ($g, $c) => [
            'currency' => $c, 'in_minor' => $g->sum('in_minor'), 'out_minor' => $g->sum('out_minor'), 'net_minor' => $g->sum('in_minor') - $g->sum('out_minor'),
        ])->sortKeys()->values();

        return ApiResponse::ok(['from' => $from, 'to' => $to, 'timezone' => $tz, 'entries' => $entries, 'totals' => $totals]);
    }
}
