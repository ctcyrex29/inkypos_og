<?php

namespace App\Audit;

use App\Http\Middleware\AssignRequestId;
use App\Models\AuditLog;
use App\Models\Device;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Model;

/** Records security-relevant actions. Call inside the same transaction as the change it describes. */
final class Audit
{
    /**
     * @param  array<string, mixed>  $metadata
     */
    public static function record(
        string $action,
        ?Model $subject = null,
        array $metadata = [],
        ?string $tenantId = null,
        User|Device|null $actor = null,
    ): AuditLog {
        $request = request();
        $actor ??= $request->user();

        return AuditLog::create([
            'tenant_id' => $tenantId ?? app(TenantContext::class)->id(),
            'actor_type' => match (true) {
                $actor instanceof User => 'user',
                $actor instanceof Device => 'device',
                default => 'anonymous',
            },
            'actor_id' => $actor?->getKey(),
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'metadata' => $metadata ?: null,
            'ip' => $request->ip(),
            'request_id' => AssignRequestId::current(),
        ]);
    }
}
