<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Register;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Branches and registers. All queries are tenant-scoped by BelongsToTenant. */
class StructureController extends Controller
{
    public function __construct(private readonly TenantContext $context) {}

    public function branches(): JsonResponse
    {
        return ApiResponse::ok(Branch::orderBy('code')->get()->map->toApi()->values());
    }

    public function createBranch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['required', 'string', 'max:16', 'alpha_dash',
                Rule::unique('branches')->where('tenant_id', $this->context->id())],
        ]);

        $branch = DB::transaction(function () use ($data) {
            $this->assertWithinLimit('max_branches', Branch::lockForUpdate()->count(), 'branches');
            $branch = Branch::create($data);
            Audit::record('branch.created', $branch);

            return $branch;
        });

        return ApiResponse::ok($branch->toApi(), 201);
    }

    public function registers(): JsonResponse
    {
        return ApiResponse::ok(Register::with('activeDevice')->orderBy('code')->get()->map->toApi()->values());
    }

    public function createRegister(Request $request, Branch $branch): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['required', 'string', 'max:16', 'alpha_dash',
                Rule::unique('registers')->where('tenant_id', $this->context->id())->where('branch_id', $branch->id)],
        ]);

        $register = DB::transaction(function () use ($data, $branch) {
            $this->assertWithinLimit('max_registers', Register::lockForUpdate()->count(), 'registers');
            $register = Register::create([...$data, 'branch_id' => $branch->id]);
            Audit::record('register.created', $register);

            return $register;
        });

        return ApiResponse::ok($register->toApi(), 201);
    }

    private function assertWithinLimit(string $limit, int $current, string $what): void
    {
        $subscription = $this->context->tenant()->subscription()->with('plan')->first();
        if (! $subscription?->isEntitled()) {
            throw ApiException::subscriptionInactive();
        }
        if ($current >= $subscription->plan->limit($limit)) {
            throw ApiException::planLimit($what);
        }
    }
}
