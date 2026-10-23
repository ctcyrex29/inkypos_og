<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Auth\Permission;
use App\Catalogue\Catalogue;
use App\Catalogue\ChangeFeed;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\ExchangeRate;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Support\ApiResponse;
use App\Support\Like;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

class CatalogueController extends Controller
{
    public function __construct(
        private readonly Catalogue $catalogue,
    ) {}

    /** Resolved on every use: controllers, services and middleware can outlive a request (route caching, Octane). */
    private function context(): TenantContext
    {
        return app(TenantContext::class);
    }

    /** GET /sync/changes — what tills pull to work offline. */
    public function changes(Request $request, ChangeFeed $feed): JsonResponse
    {
        $data = $request->validate(['cursor' => ['nullable', 'string', 'max:80'], 'limit' => ['nullable', 'integer', 'min:1']]);
        try {
            return ApiResponse::ok($feed->page($data['cursor'] ?? '', (int) ($data['limit'] ?? 200)));
        } catch (InvalidArgumentException) {
            throw new ApiException('validation_failed', 'Unknown cursor; start again with an empty cursor.', 422);
        }
    }

    // ── Products ─────────────────────────────────────────────────────────────

    public function products(Request $request): JsonResponse
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:100'], 'category_id' => ['nullable', 'uuid']]);
        $search = trim((string) ($data['search'] ?? ''));
        $query = Product::orderBy('name');
        if ($search !== '') {
            $query->where(fn ($q) => Like::contains($q, 'name', $search)->orWhere('sku', $search));
        }
        if ($data['category_id'] ?? null) {
            $query->where('category_id', $data['category_id']);
        }

        return ApiResponse::ok($query->limit(200)->get()->map(fn (Product $p) => $this->productPayload($p))->values());
    }

    /** Cost and reorder level are for people who manage the catalogue, not cashiers or tills. */
    private function productPayload(Product $p): array
    {
        $role = $this->context()->membership()?->role;

        return $role?->can(Permission::ManageCatalogue) ? $this->catalogue->productForBackOffice($p) : $this->catalogue->product($p);
    }

    public function storeProduct(Request $request): JsonResponse
    {
        $data = $this->validateProduct($request);
        $product = DB::transaction(function () use ($data) {
            $product = Product::create([...collect($data)->except('barcodes')->all(), 'version' => 1, 'active' => $data['active'] ?? true]);
            $this->catalogue->setBarcodes($product, $data['barcodes'] ?? []);
            $this->catalogue->record('product', $product->id);
            Audit::record('product.created', $product);

            return $product;
        });

        return ApiResponse::ok($this->productPayload($product), 201);
    }

    public function updateProduct(Request $request, Product $product): JsonResponse
    {
        $data = $this->validateProduct($request, $product);
        DB::transaction(function () use ($data, $product) {
            $product->fill(collect($data)->except('barcodes')->all());
            $product->version++;
            $product->save();
            if (array_key_exists('barcodes', $data)) {
                $this->catalogue->setBarcodes($product, $data['barcodes']);
            }
            $this->catalogue->record('product', $product->id);
            Audit::record('product.updated', $product, ['changed' => array_keys($data)]);
        });

        return ApiResponse::ok($this->productPayload($product->refresh()));
    }

    /** @return array<string, mixed> */
    private function validateProduct(Request $request, ?Product $product = null): array
    {
        $tenantId = $this->context()->id();
        $sometimes = $product ? 'sometimes' : 'required';
        $data = $request->validate([
            'sku' => [$sometimes, 'string', 'max:64', Rule::unique('products')->where('tenant_id', $tenantId)->ignore($product?->id)],
            'name' => [$sometimes, 'string', 'max:200'],
            'unit_price_minor' => [$sometimes, 'integer', 'min:0', 'max:999999999999'],
            'unit' => ['sometimes', Rule::in(Product::UNITS)],
            'tax_code' => [$sometimes, 'string', 'max:32'],
            'tax_rate_bp' => [$sometimes, 'integer', 'min:0', 'max:100000'],
            'tax_inclusive' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
            'barcodes' => ['sometimes', 'array', 'max:20'],
            'barcodes.*' => ['string', 'regex:/^[0-9A-Za-z\-\.]{1,64}$/'],
            'category_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('categories', 'id')->where('tenant_id', $tenantId)],
            'cost_minor' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:999999999999'],
            'reorder_level_milli' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:999999999999'],
            'track_stock' => ['sometimes', 'boolean'],
            'option_groups' => ['sometimes', 'array', 'max:10'],
            'option_groups.*.id' => ['nullable', 'uuid'],
            'option_groups.*.name' => ['required', 'string', 'max:60'],
            'option_groups.*.required' => ['required', 'boolean'],
            'option_groups.*.multiple' => ['required', 'boolean'],
            'option_groups.*.options' => ['required', 'array', 'min:1', 'max:30'],
            'option_groups.*.options.*.id' => ['nullable', 'uuid'],
            'option_groups.*.options.*.name' => ['required', 'string', 'max:60'],
            'option_groups.*.options.*.price_delta_minor' => ['required', 'integer', 'min:0', 'max:100000000'],
        ]);
        if (array_key_exists('option_groups', $data)) {
            $data['option_groups'] = $this->normaliseOptionGroups($data['option_groups']);
        }

        // A barcode may belong to only one product in a business.
        $taken = DB::table('product_barcodes')->where('tenant_id', $tenantId)->whereIn('barcode', $data['barcodes'] ?? [])
            ->when($product, fn ($q) => $q->where('product_id', '!=', $product->id))->pluck('barcode')->all();
        if ($taken !== []) {
            throw new ApiException('validation_failed', 'Barcode already used by another product: '.implode(', ', $taken), 422);
        }

        return $data;
    }

    /**
     * Keeps the ids of options that already exist (sales and recipes refer to
     * them) and gives new ones a fresh id. Ids are unique across the product.
     *
     * @param  list<array<string, mixed>>  $groups
     * @return list<array<string, mixed>>
     */
    private function normaliseOptionGroups(array $groups): array
    {
        $seen = [];
        $id = function (?string $given) use (&$seen): string {
            // Tills accept only UUIDv7 ids; anything else is replaced rather than sent on.
            $keep = $given && ! isset($seen[$given]) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $given) === 1;
            $id = $keep ? strtolower($given) : (string) Str::uuid7();
            $seen[$id] = true;

            return $id;
        };

        return array_map(fn (array $g) => [
            'id' => $id($g['id'] ?? null), 'name' => $g['name'], 'required' => (bool) $g['required'], 'multiple' => (bool) $g['multiple'],
            'options' => array_map(fn (array $o) => ['id' => $id($o['id'] ?? null), 'name' => $o['name'], 'price_delta_minor' => (int) $o['price_delta_minor']], array_values($g['options'])),
        ], array_values($groups));
    }

    // ── Payment methods ──────────────────────────────────────────────────────

    public function paymentMethods(): JsonResponse
    {
        return ApiResponse::ok(PaymentMethod::orderBy('position')->get()->map(fn ($m) => $this->catalogue->paymentMethod($m))->values());
    }

    public function updatePaymentMethod(Request $request, PaymentMethod $paymentMethod): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'active' => ['sometimes', 'boolean'],
            'currencies' => ['sometimes', 'array', 'min:1'],
            'currencies.*' => [Rule::in(['USD', 'ZWG', 'ZAR', 'BWP'])],
            'requires_reference' => ['sometimes', 'boolean'],
        ]);
        DB::transaction(function () use ($data, $paymentMethod) {
            $paymentMethod->fill($data);
            $paymentMethod->version++;
            $paymentMethod->save();
            $this->catalogue->record('payment_method', $paymentMethod->id);
            Audit::record('payment_method.updated', $paymentMethod, ['changed' => array_keys($data)]);
        });

        return ApiResponse::ok($this->catalogue->paymentMethod($paymentMethod->refresh()));
    }

    // ── Exchange rates ───────────────────────────────────────────────────────

    public function exchangeRates(): JsonResponse
    {
        return ApiResponse::ok(ExchangeRate::orderByDesc('version')->limit(50)->get()->map(fn ($r) => $this->catalogue->exchangeRate($r))->values());
    }

    public function storeExchangeRate(Request $request): JsonResponse
    {
        $base = $this->context()->tenant()->base_currency;
        $data = $request->validate([
            'quote_currency' => ['required', Rule::in(['USD', 'ZWG', 'ZAR', 'BWP']), Rule::notIn([$base])],
            // Sale-currency units per one quote-currency unit, e.g. 0.03703704 USD per ZWG.
            'rate' => ['required', 'string', 'regex:/^\d{1,12}(\.\d{1,8})?$/', 'not_regex:/^0+(\.0+)?$/'],
        ]);

        $rate = DB::transaction(function () use ($data, $base, $request) {
            $version = (int) ExchangeRate::where('base_currency', $base)->where('quote_currency', $data['quote_currency'])->lockForUpdate()->max('version') + 1;
            $rate = ExchangeRate::create([
                'base_currency' => $base,
                'quote_currency' => $data['quote_currency'],
                'rate' => $data['rate'],
                'version' => $version,
                'effective_at' => now(),
                'set_by_user_id' => $request->user()->id,
            ]);
            $this->catalogue->record('exchange_rate', $rate->id);
            Audit::record('exchange_rate.set', $rate, ['rate' => $data['rate'], 'quote' => $data['quote_currency']]);

            return $rate;
        });

        return ApiResponse::ok($this->catalogue->exchangeRate($rate), 201);
    }

    // ── Stock ────────────────────────────────────────────────────────────────

    /** On hand per product, derived from the append-only ledger. */
    public function stock(Request $request): JsonResponse
    {
        $data = $request->validate(['branch_id' => ['nullable', 'uuid']]);
        $rows = DB::table('stock_movements')
            ->where('tenant_id', $this->context()->id())
            ->when($data['branch_id'] ?? null, fn ($q, $b) => $q->where('branch_id', $b))
            ->groupBy('product_id')
            ->selectRaw('product_id, SUM(quantity_delta_milli) AS on_hand_milli')
            ->get()
            ->map(fn ($r) => ['product_id' => $r->product_id, 'on_hand_milli' => (int) $r->on_hand_milli]);

        return ApiResponse::ok($rows->values());
    }
}
