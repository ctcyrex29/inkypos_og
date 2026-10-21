<?php

namespace App\Http\Controllers\Api\V1;

use App\Audit\Audit;
use App\Catalogue\Catalogue;
use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Reports\Reports;
use App\Support\ApiResponse;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Owner and manager reports (OG-2). Read-only, except the business time zone they group by. */
class ReportsController extends Controller
{
    public function __construct(
        private readonly Reports $reports,
    ) {}

    /** @return array{from: string, to: string, branch_id: ?string} */
    private function period(Request $request): array
    {
        $tenantId = app(TenantContext::class)->id();
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'branch_id' => ['nullable', 'uuid', Rule::exists('branches', 'id')->where('tenant_id', $tenantId)],
        ]);
        if (CarbonImmutable::parse($data['from'])->diffInDays(CarbonImmutable::parse($data['to'])) >= Reports::MAX_DAYS) {
            throw new ApiException('validation_failed', 'Choose a period of at most '.Reports::MAX_DAYS.' days.', 422);
        }

        return ['from' => $data['from'], 'to' => $data['to'], 'branch_id' => $data['branch_id'] ?? null];
    }

    public function sales(Request $request): JsonResponse
    {
        $p = $this->period($request);

        return ApiResponse::ok([
            ...$this->reports->salesSummary($p['from'], $p['to'], $p['branch_id']),
            'top_products' => $this->reports->topProducts($p['from'], $p['to'], $p['branch_id'], 10),
        ]);
    }

    public function vat(Request $request): JsonResponse
    {
        $p = $this->period($request);

        return ApiResponse::ok($this->reports->vat($p['from'], $p['to'], $p['branch_id']));
    }

    public function profit(Request $request): JsonResponse
    {
        $p = $this->period($request);

        return ApiResponse::ok($this->reports->profit($p['from'], $p['to'], $p['branch_id']));
    }

    public function shifts(Request $request): JsonResponse
    {
        $p = $this->period($request);

        return ApiResponse::ok($this->reports->shifts($p['from'], $p['to'], $p['branch_id']));
    }

    public function shift(string $shift): JsonResponse
    {
        $report = $this->reports->shiftReport($shift);
        if ($report === null) {
            throw new ApiException('not_found', 'No such shift.', 404);
        }

        return ApiResponse::ok($report);
    }

    /** GET /audit — newest first; who did what in the back office and on the till. */
    public function audit(Request $request): JsonResponse
    {
        $data = $request->validate(['action' => ['nullable', 'string', 'max:64'], 'before' => ['nullable', 'date'], 'limit' => ['nullable', 'integer', 'min:1', 'max:200']]);
        $rows = DB::table('audit_logs')->where('tenant_id', app(TenantContext::class)->id())
            ->when($data['action'] ?? null, fn ($q, $a) => $q->where('action', 'like', str_replace(['%', '_'], ['\%', '\_'], $a).'%'))
            ->when($data['before'] ?? null, fn ($q, $b) => $q->where('created_at', '<', CarbonImmutable::parse($b)->utc()))
            ->orderByDesc('created_at')->limit($data['limit'] ?? 100)
            ->get(['id', 'actor_type', 'actor_id', 'action', 'subject_type', 'subject_id', 'metadata', 'created_at']);
        $users = DB::table('users')->whereIn('id', $rows->where('actor_type', 'user')->pluck('actor_id')->unique()->all())->pluck('name', 'id');
        $devices = DB::table('devices')->whereIn('id', $rows->where('actor_type', 'device')->pluck('actor_id')->unique()->all())->pluck('name', 'id');

        return ApiResponse::ok($rows->map(fn ($r) => [
            'id' => $r->id, 'action' => $r->action, 'actor_type' => $r->actor_type,
            'actor' => match ($r->actor_type) { 'user' => $users[$r->actor_id] ?? null, 'device' => $devices[$r->actor_id] ?? null, default => null },
            'subject_type' => $r->subject_type, 'subject_id' => $r->subject_id,
            'metadata' => $r->metadata ? json_decode($r->metadata, true) : null,
            'created_at' => CarbonImmutable::parse($r->created_at, 'UTC')->toIso8601String(),
        ])->values());
    }

    /** GET /business — the settings below, as they stand. */
    public function showBusiness(): JsonResponse
    {
        $t = app(TenantContext::class)->tenant();

        return ApiResponse::ok(['id' => $t->id, 'name' => $t->name, 'timezone' => $t->timezone, 'business_type' => $t->business_type ?? 'retail']);
    }

    /** PATCH /business — the time zone reports use for "a day", and whether tills work as a shop or a restaurant. */
    public function updateBusiness(Request $request, Catalogue $catalogue): JsonResponse
    {
        $data = $request->validate([
            'timezone' => ['sometimes', 'string', Rule::in(DateTimeZone::listIdentifiers())],
            'business_type' => ['sometimes', Rule::in(['retail', 'restaurant'])],
        ]);
        $tenant = app(TenantContext::class)->tenant();
        DB::transaction(function () use ($tenant, $data, $catalogue) {
            $tenant->fill($data)->save();
            $catalogue->record('business', $tenant->id);
            Audit::record('business.updated', $tenant, ['changed' => array_keys($data)]);
        });

        return ApiResponse::ok(['id' => $tenant->id, 'name' => $tenant->name, 'timezone' => $tenant->timezone, 'business_type' => $tenant->business_type]);
    }
}
