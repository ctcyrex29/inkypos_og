<?php

namespace App\Http\Controllers\Api\V1;

use App\Entitlements\EntitlementIssuer;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;

class EntitlementController extends Controller
{
    public function __invoke(TenantContext $context, EntitlementIssuer $issuer): JsonResponse
    {
        return ApiResponse::ok($issuer->issue($context->tenant(), $context->device()));
    }
}
