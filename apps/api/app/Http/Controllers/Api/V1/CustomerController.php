<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Catalogue\Catalogue;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Support\ApiResponse;
use App\Support\Like;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Customers a sale can name. Tills get name and phone through the change feed;
 * email and notes stay in the back office.
 */
class CustomerController extends Controller
{
    public function __construct(
        private readonly Catalogue $catalogue,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:100']]);
        $search = trim((string) ($data['search'] ?? ''));
        $query = Customer::orderBy('name');
        if ($search !== '') {
            // Digits match anywhere, leading zeros dropped, so 077… finds +263 77… (as on the till).
            $digits = ltrim((string) preg_replace('/\D/', '', $search), '0');
            $isPhone = strlen($digits) >= 3 && preg_match('/^[0-9\s()+-]+$/', $search) === 1;
            $query->where(fn ($q) => Like::contains($q, $isPhone ? 'phone_digits' : 'name', $isPhone ? $digits : $search));
        }

        return ApiResponse::ok($query->limit(200)->get()->map(fn ($c) => $this->full($c))->values());
    }

    /** One customer with their purchase history from synced sales. */
    public function show(Customer $customer): JsonResponse
    {
        $tenantId = app(TenantContext::class)->id();
        $sales = DB::table('sales')->where('tenant_id', $tenantId)->where('customer_id', $customer->id);
        $recent = (clone $sales)->orderByDesc('completed_at')->limit(20)
            ->get(['id', 'receipt_number', 'completed_at', 'currency', 'total_minor']);

        return ApiResponse::ok([
            ...$this->full($customer),
            'sales_count' => (clone $sales)->count(),
            'sales_total_minor' => (int) (clone $sales)->sum('total_minor'),
            'recent_sales' => $recent->map(fn ($s) => [
                'sale_id' => $s->id, 'receipt_number' => $s->receipt_number, 'completed_at' => $s->completed_at,
                'currency' => $s->currency, 'total_minor' => (int) $s->total_minor,
            ])->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $customer = DB::transaction(function () use ($data) {
            $customer = Customer::create([...$data, 'version' => 1, 'active' => $data['active'] ?? true]);
            $this->catalogue->record('customer', $customer->id);
            Audit::record('customer.created', $customer);

            return $customer;
        });

        return ApiResponse::ok($this->full($customer), 201);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $data = $this->validated($request, $customer);
        DB::transaction(function () use ($data, $customer) {
            $customer->fill($data);
            $customer->version++;
            $customer->save();
            $this->catalogue->record('customer', $customer->id);
            Audit::record('customer.updated', $customer, ['changed' => array_keys($data)]);
        });

        return ApiResponse::ok($this->full($customer->refresh()));
    }

    /** @return array<string, mixed> */
    private function full(Customer $c): array
    {
        return [...$this->catalogue->customer($c), 'email' => $c->email, 'notes' => $c->notes];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Customer $customer = null): array
    {
        return $request->validate([
            'name' => [$customer ? 'sometimes' : 'required', 'string', 'max:120'],
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^\+?[0-9 ()-]{5,32}$/'],
            'email' => ['sometimes', 'nullable', 'email', 'max:254'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:500'],
            'active' => ['sometimes', 'boolean'],
        ]);
    }
}
