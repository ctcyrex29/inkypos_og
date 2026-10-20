<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Append-only. Never updated or deleted by application code. */
#[Fillable(['tenant_id', 'actor_type', 'actor_id', 'action', 'subject_type', 'subject_id', 'metadata', 'ip', 'request_id'])]
class AuditLog extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }
}
