<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Stock levels and back-office stock movements. Stock is never stored as a
 * number: on hand is the sum of the append-only movement ledger, which sales,
 * refunds, purchases and the adjustments recorded here all write to.
 */
class StockController extends Controller
{
    /** Reasons a manager can record by hand, with the sign each requires. */
    public const ADJUSTMENT_REASONS = ['intake' => 1, 'damage' => -1, 'correction' => 0, 'count' => 0];

    private function tenantId(): string
    {
        return app(TenantContext::class)->id();
    }

    /** GET /stock/levels — on hand, low-stock flag and valuation per product. */
    public function levels(Request $request): JsonResponse
    {
        $data = $request->validate(['branch_id' => ['nullable', 'uuid'], 'low_only' => ['nullable', 'boolean']]);
        $onHand = $this->onHand(null, $data['branch_id'] ?? null);

        $rows = [];
        $value = 0;
        // Dishes made to order are not stock; their ingredients are.
        foreach (Product::where('track_stock', true)->orderBy('name')->get() as $p) {
            $qty = $onHand[$p->id] ?? 0;
            $low = $p->reorder_level_milli !== null && $qty <= $p->reorder_level_milli;
            // Valuation at last cost; negative stock is shown but not valued.
            $lineValue = $p->cost_minor !== null && $qty > 0 ? intdiv($qty * $p->cost_minor + 500, 1000) : null;
            if (($data['low_only'] ?? false) && ! $low) {
                continue;
            }
            $value += $lineValue ?? 0;
            $rows[] = [
                'product_id' => $p->id, 'sku' => $p->sku, 'name' => $p->name, 'unit' => $p->unit, 'active' => $p->active,
                'on_hand_milli' => $qty, 'reorder_level_milli' => $p->reorder_level_milli, 'low' => $low,
                'cost_minor' => $p->cost_minor, 'value_minor' => $lineValue,
            ];
        }

        return ApiResponse::ok(['items' => $rows, 'total_value_minor' => $value, 'currency' => app(TenantContext::class)->tenant()->base_currency]);
    }

    /** GET /stock/movements?product_id= — the ledger for one product, newest first. */
    public function movements(Request $request): JsonResponse
    {
        $data = $request->validate(['product_id' => ['required', 'uuid'], 'limit' => ['nullable', 'integer', 'min:1', 'max:500']]);
        $rows = DB::table('stock_movements')->where('tenant_id', $this->tenantId())->where('product_id', $data['product_id'])
            ->orderByDesc('occurred_at')->orderByDesc('created_at')->limit($data['limit'] ?? 100)
            ->get(['id', 'branch_id', 'quantity_delta_milli', 'reason', 'sale_id', 'purchase_id', 'note', 'occurred_at']);

        return ApiResponse::ok($rows->map(fn ($r) => [
            'id' => $r->id, 'branch_id' => $r->branch_id, 'quantity_delta_milli' => (int) $r->quantity_delta_milli, 'reason' => $r->reason,
            'sale_id' => $r->sale_id, 'purchase_id' => $r->purchase_id, 'note' => $r->note, 'occurred_at' => $r->occurred_at,
        ])->values());
    }

    /**
     * POST /stock/adjustments. intake adds, damage removes, correction is either
     * sign; count records a stock-take: the movement is counted minus on hand.
     */
    public function adjust(Request $request): JsonResponse
    {
        $tenantId = $this->tenantId();
        $data = $request->validate([
            'branch_id' => ['required', 'uuid', Rule::exists('branches', 'id')->where('tenant_id', $tenantId)],
            'product_id' => ['required', 'uuid', Rule::exists('products', 'id')->where('tenant_id', $tenantId)],
            'reason' => ['required', Rule::in(array_keys(self::ADJUSTMENT_REASONS))],
            'quantity_delta_milli' => ['required_unless:reason,count', 'prohibited_if:reason,count', 'integer', 'between:-999999999999,999999999999'],
            'counted_milli' => ['required_if:reason,count', 'prohibited_unless:reason,count', 'integer', 'between:0,999999999999'],
            'note' => ['nullable', 'string', 'max:300'],
        ]);

        $movement = DB::transaction(function () use ($data, $request) {
            // Serialise stock-takes on one product so two counts cannot both apply.
            Product::whereKey($data['product_id'])->lockForUpdate()->first();
            $delta = $data['reason'] === 'count'
                ? $data['counted_milli'] - ($this->onHand($data['product_id'], $data['branch_id'])[$data['product_id']] ?? 0)
                : $data['quantity_delta_milli'];

            $sign = self::ADJUSTMENT_REASONS[$data['reason']];
            if ($data['reason'] !== 'count' && ($delta === 0 || ($sign !== 0 && $delta * $sign < 0))) {
                throw new ApiException('validation_failed', match ($data['reason']) {
                    'intake' => 'Stock intake must add stock.',
                    'damage' => 'Damaged stock must remove stock.',
                    default => 'A correction must change the quantity.',
                }, 422);
            }

            $row = [
                'id' => (string) Str::uuid7(), 'tenant_id' => $this->tenantId(), 'branch_id' => $data['branch_id'], 'product_id' => $data['product_id'],
                'quantity_delta_milli' => $delta, 'reason' => $data['reason'], 'note' => $data['note'] ?? null,
                'recorded_by_user_id' => $request->user()->id, 'occurred_at' => now(),
            ];
            DB::table('stock_movements')->insert($row);
            Audit::record('stock.adjusted', null, ['product_id' => $data['product_id'], 'reason' => $data['reason'], 'quantity_delta_milli' => $delta]);

            return $row;
        });

        return ApiResponse::ok([
            'id' => $movement['id'], 'product_id' => $movement['product_id'], 'branch_id' => $movement['branch_id'],
            'reason' => $movement['reason'], 'quantity_delta_milli' => $movement['quantity_delta_milli'],
            'on_hand_milli' => $this->onHand($movement['product_id'], $movement['branch_id'])[$movement['product_id']] ?? 0,
        ], 201);
    }

    /** @return array<string, int> product id => on hand in thousandths */
    private function onHand(?string $productId, ?string $branchId): array
    {
        return DB::table('stock_movements')->where('tenant_id', $this->tenantId())
            ->when($productId, fn ($q) => $q->where('product_id', $productId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->groupBy('product_id')->selectRaw('product_id, SUM(quantity_delta_milli) AS qty')
            ->pluck('qty', 'product_id')->map(fn ($v) => (int) $v)->all();
    }
}
