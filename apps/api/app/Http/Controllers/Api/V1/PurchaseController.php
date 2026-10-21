<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Purchase;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Goods received from suppliers. Recording one adds stock (reason "purchase")
 * and sets each product's last cost. A purchase is never edited; mistakes are
 * corrected with a stock adjustment.
 */
class PurchaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['supplier_id' => ['nullable', 'uuid']]);
        $purchases = Purchase::with('supplier')->when($data['supplier_id'] ?? null, fn ($q, $s) => $q->where('supplier_id', $s))
            ->orderByDesc('received_at')->limit(100)->get();

        return ApiResponse::ok($purchases->map(fn ($p) => $this->summary($p))->values());
    }

    public function show(Purchase $purchase): JsonResponse
    {
        $lines = DB::table('purchase_lines')->join('products', 'products.id', '=', 'purchase_lines.product_id')
            ->where('purchase_lines.tenant_id', $purchase->tenant_id)->where('purchase_lines.purchase_id', $purchase->id)
            ->orderBy('products.name')
            ->get(['purchase_lines.product_id', 'products.name', 'purchase_lines.quantity_milli', 'purchase_lines.unit_cost_minor', 'purchase_lines.line_cost_minor']);

        return ApiResponse::ok([
            ...$this->summary($purchase->load('supplier')),
            'lines' => $lines->map(fn ($l) => [
                'product_id' => $l->product_id, 'name' => $l->name, 'quantity_milli' => (int) $l->quantity_milli,
                'unit_cost_minor' => (int) $l->unit_cost_minor, 'line_cost_minor' => (int) $l->line_cost_minor,
            ])->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = app(TenantContext::class)->id();
        $data = $request->validate([
            'branch_id' => ['required', 'uuid', Rule::exists('branches', 'id')->where('tenant_id', $tenantId)],
            'supplier_id' => ['required', 'uuid', Rule::exists('suppliers', 'id')->where('tenant_id', $tenantId)],
            'reference' => ['nullable', 'string', 'max:64'],
            'received_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1', 'max:200'],
            'lines.*.product_id' => ['required', 'uuid', 'distinct', Rule::exists('products', 'id')->where('tenant_id', $tenantId)],
            'lines.*.quantity_milli' => ['required', 'integer', 'min:1', 'max:999999999'],
            'lines.*.unit_cost_minor' => ['required', 'integer', 'min:0', 'max:999999999999'],
        ]);

        $purchase = DB::transaction(function () use ($data, $request, $tenantId) {
            $receivedAt = isset($data['received_at']) ? Carbon::parse($data['received_at']) : now();
            if ($receivedAt->isFuture()) {
                throw new ApiException('validation_failed', 'Goods cannot be received in the future.', 422);
            }
            $lines = array_map(fn ($l) => [
                ...$l,
                // Rounded half up to a whole cent: quantity is in thousandths of a unit.
                'line_cost_minor' => intdiv($l['quantity_milli'] * $l['unit_cost_minor'] + 500, 1000),
            ], $data['lines']);

            $purchase = Purchase::create([
                'branch_id' => $data['branch_id'], 'supplier_id' => $data['supplier_id'], 'reference' => $data['reference'] ?? null,
                'received_at' => $receivedAt, 'total_cost_minor' => array_sum(array_column($lines, 'line_cost_minor')),
                'notes' => $data['notes'] ?? null, 'recorded_by_user_id' => $request->user()->id,
            ]);
            foreach ($lines as $line) {
                DB::table('purchase_lines')->insert([
                    'id' => (string) Str::uuid7(), 'tenant_id' => $tenantId, 'purchase_id' => $purchase->id, 'product_id' => $line['product_id'],
                    'quantity_milli' => $line['quantity_milli'], 'unit_cost_minor' => $line['unit_cost_minor'], 'line_cost_minor' => $line['line_cost_minor'],
                ]);
                DB::table('stock_movements')->insert([
                    'id' => (string) Str::uuid7(), 'tenant_id' => $tenantId, 'branch_id' => $data['branch_id'], 'product_id' => $line['product_id'],
                    'quantity_delta_milli' => $line['quantity_milli'], 'reason' => 'purchase', 'purchase_id' => $purchase->id,
                    'recorded_by_user_id' => $request->user()->id, 'occurred_at' => $receivedAt,
                ]);
                // Last cost; tills never see cost, so no change-feed entry is needed.
                Product::whereKey($line['product_id'])->update(['cost_minor' => $line['unit_cost_minor']]);
            }
            Audit::record('purchase.recorded', $purchase, ['lines' => count($lines), 'total_cost_minor' => $purchase->total_cost_minor]);

            return $purchase;
        });

        return $this->show($purchase)->setStatusCode(201);
    }

    /** @return array<string, mixed> */
    private function summary(Purchase $p): array
    {
        return [
            'id' => $p->id, 'branch_id' => $p->branch_id, 'supplier_id' => $p->supplier_id, 'supplier_name' => $p->supplier?->name,
            'reference' => $p->reference, 'received_at' => $p->received_at->toIso8601String(), 'total_cost_minor' => $p->total_cost_minor,
            'notes' => $p->notes,
        ];
    }
}
