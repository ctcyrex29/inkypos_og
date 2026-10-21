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
 * What a dish uses up. When a sale of the product is synced, each ingredient
 * is taken off stock (reason "recipe"): the product's own lines always, and an
 * option's lines when that option was chosen.
 */
class RecipeController extends Controller
{
    public function show(Product $product): JsonResponse
    {
        return ApiResponse::ok($this->payload($product));
    }

    /** PUT replaces the whole recipe. */
    public function update(Request $request, Product $product): JsonResponse
    {
        $tenantId = app(TenantContext::class)->id();
        $data = $request->validate([
            'items' => ['present', 'array', 'max:50'],
            'items.*.option_id' => ['nullable', 'uuid'],
            'items.*.ingredient_id' => ['required', 'uuid', Rule::exists('products', 'id')->where('tenant_id', $tenantId), Rule::notIn([$product->id])],
            'items.*.quantity_milli' => ['required', 'integer', 'min:1', 'max:999999999'],
        ]);
        $optionIds = collect($product->option_groups ?? [])->flatMap(fn ($g) => array_column($g['options'], 'id'))->all();
        foreach ($data['items'] as $i => $item) {
            if (($item['option_id'] ?? null) !== null && ! in_array($item['option_id'], $optionIds, true)) {
                throw new ApiException('validation_failed', "items.{$i}: that option is not on {$product->name}.", 422);
            }
        }

        DB::transaction(function () use ($data, $product, $tenantId) {
            DB::table('recipe_items')->where('tenant_id', $tenantId)->where('product_id', $product->id)->delete();
            foreach ($data['items'] as $item) {
                DB::table('recipe_items')->insert([
                    'id' => (string) Str::uuid7(), 'tenant_id' => $tenantId, 'product_id' => $product->id, 'option_id' => $item['option_id'] ?? null,
                    'ingredient_id' => $item['ingredient_id'], 'quantity_milli' => $item['quantity_milli'],
                ]);
            }
            Audit::record('recipe.updated', $product, ['items' => count($data['items'])]);
        });

        return ApiResponse::ok($this->payload($product));
    }

    /** @return array<string, mixed> */
    private function payload(Product $product): array
    {
        $items = DB::table('recipe_items')->join('products', 'products.id', '=', 'recipe_items.ingredient_id')
            ->where('recipe_items.tenant_id', $product->tenant_id)->where('recipe_items.product_id', $product->id)
            ->orderBy('products.name')
            ->get(['recipe_items.option_id', 'recipe_items.ingredient_id', 'products.name', 'products.unit', 'recipe_items.quantity_milli']);

        return [
            'product_id' => $product->id,
            'items' => $items->map(fn ($r) => [
                'option_id' => $r->option_id, 'ingredient_id' => $r->ingredient_id, 'ingredient_name' => $r->name, 'unit' => $r->unit, 'quantity_milli' => (int) $r->quantity_milli,
            ])->values(),
        ];
    }
}
