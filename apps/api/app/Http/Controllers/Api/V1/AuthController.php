<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Auth\Role;
use App\Auth\TokenIssuer;
use App\Billing\PlanCatalog;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function __construct(private readonly TokenIssuer $tokens) {}

    /** Creates a business, its owner and a trial subscription. */
    public function signup(Request $request, PlanCatalog $plans, TenantContext $context): JsonResponse
    {
        $data = $request->validate([
            'business_name' => ['required', 'string', 'min:2', 'max:120'],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:254', 'unique:users,email'],
            'password' => ['required', 'string', 'min:10', 'max:200'],
            'device_name' => ['required', 'string', 'max:100'],
        ]);

        [$user, $tokens] = DB::transaction(function () use ($data, $plans, $context) {
            $user = User::create(['name' => $data['name'], 'email' => strtolower($data['email']), 'password' => $data['password']]);
            $tenant = Tenant::create(['name' => $data['business_name'], 'status' => 'active']);
            Membership::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'role' => Role::Owner]);

            $context->run($tenant, function () use ($plans) {
                Subscription::create([
                    'plan_id' => $plans->trialPlan()->id,
                    'status' => 'trialing',
                    'current_period_ends_at' => now()->addDays((int) config('inkypos.trial.days')),
                ]);
            });

            Audit::record('tenant.created', $tenant, tenantId: $tenant->id, actor: $user);

            return [$user, $this->tokens->issue($user, $data['device_name'])];
        });

        return ApiResponse::ok($this->session($user, $tokens), 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'max:254'],
            'password' => ['required', 'string', 'max:200'],
            'device_name' => ['required', 'string', 'max:100'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();
        // Do equivalent bcrypt work for unknown emails so timing does not reveal which emails exist.
        $valid = $user ? Hash::check($data['password'], $user->password) : (bool) Hash::make($data['password']) && false;

        if (! $user || ! $valid) {
            Audit::record('auth.login_failed', metadata: ['email' => strtolower($data['email'])]);

            throw ApiException::unauthenticated('Invalid email or password.');
        }

        $tokens = DB::transaction(function () use ($user, $data) {
            Audit::record('auth.login', $user, actor: $user);

            return $this->tokens->issue($user, $data['device_name']);
        });

        return ApiResponse::ok($this->session($user, $tokens));
    }

    public function refresh(Request $request): JsonResponse
    {
        $data = $request->validate(['refresh_token' => ['required', 'string', 'max:200']]);

        return ApiResponse::ok(['tokens' => $this->tokens->refresh($data['refresh_token'])]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var PersonalAccessToken $token */
        $token = $request->user()->currentAccessToken();
        $this->tokens->revokeForAccessToken($token);

        return ApiResponse::ok(['revoked' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return ApiResponse::ok(['user' => $user->toApi(), 'memberships' => $user->membershipsForApi()]);
    }

    /**
     * @param  array<string, string>  $tokens
     * @return array<string, mixed>
     */
    private function session(User $user, array $tokens): array
    {
        return ['user' => $user->toApi(), 'memberships' => $user->membershipsForApi(), 'tokens' => $tokens];
    }
}
