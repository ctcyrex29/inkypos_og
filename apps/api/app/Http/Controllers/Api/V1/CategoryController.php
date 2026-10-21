<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Catalogue\Catalogue;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Product categories; tills receive them through the change feed for browsing. */
class CategoryController extends Controller
{
    public function __construct(
        private readonly Catalogue $catalogue,
    ) {}

    public function index(): JsonResponse
    {
        return ApiResponse::ok(Category::orderBy('position')->orderBy('name')->get()->map(fn ($c) => $this->catalogue->category($c))->values());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $category = DB::transaction(function () use ($data) {
            $category = Category::create([...$data, 'version' => 1, 'active' => $data['active'] ?? true]);
            $this->catalogue->record('category', $category->id);
            Audit::record('category.created', $category);

            return $category;
        });

        return ApiResponse::ok($this->catalogue->category($category), 201);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $this->validated($request, $category);
        DB::transaction(function () use ($data, $category) {
            $category->fill($data);
            $category->version++;
            $category->save();
            $this->catalogue->record('category', $category->id);
            Audit::record('category.updated', $category, ['changed' => array_keys($data)]);
        });

        return ApiResponse::ok($this->catalogue->category($category->refresh()));
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Category $category = null): array
    {
        $tenantId = app(TenantContext::class)->id();

        return $request->validate([
            'name' => [$category ? 'sometimes' : 'required', 'string', 'max:80', Rule::unique('categories')->where('tenant_id', $tenantId)->ignore($category?->id)],
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'active' => ['sometimes', 'boolean'],
        ]);
    }
}
