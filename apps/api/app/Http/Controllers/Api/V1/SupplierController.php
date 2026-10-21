<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Suppliers goods are received from. Back office only. */
class SupplierController extends Controller
{
    public function index(): JsonResponse
    {
        return ApiResponse::ok(Supplier::orderBy('name')->get()->map(fn ($s) => $this->payload($s))->values());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $supplier = DB::transaction(function () use ($data) {
            $supplier = Supplier::create([...$data, 'active' => $data['active'] ?? true]);
            Audit::record('supplier.created', $supplier);

            return $supplier;
        });

        return ApiResponse::ok($this->payload($supplier), 201);
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        $data = $this->validated($request, $supplier);
        DB::transaction(function () use ($data, $supplier) {
            $supplier->fill($data)->save();
            Audit::record('supplier.updated', $supplier, ['changed' => array_keys($data)]);
        });

        return ApiResponse::ok($this->payload($supplier->refresh()));
    }

    /** @return array<string, mixed> */
    public static function payload(Supplier $s): array
    {
        return [
            'id' => $s->id, 'name' => $s->name, 'contact_person' => $s->contact_person, 'phone' => $s->phone,
            'email' => $s->email, 'address' => $s->address, 'active' => $s->active,
        ];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Supplier $supplier = null): array
    {
        $tenantId = app(TenantContext::class)->id();

        return $request->validate([
            'name' => [$supplier ? 'sometimes' : 'required', 'string', 'max:120', Rule::unique('suppliers')->where('tenant_id', $tenantId)->ignore($supplier?->id)],
            'contact_person' => ['sometimes', 'nullable', 'string', 'max:120'],
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^\+?[0-9 ()-]{5,32}$/'],
            'email' => ['sometimes', 'nullable', 'email', 'max:254'],
            'address' => ['sometimes', 'nullable', 'string', 'max:300'],
            'active' => ['sometimes', 'boolean'],
        ]);
    }
}
