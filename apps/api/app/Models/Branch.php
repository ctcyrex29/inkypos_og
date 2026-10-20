<?php

namespace App\Models;

use App\Tenancy\BelongsToTenant;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['tenant_id', 'name', 'code'])]
class Branch extends Model
{
    use BelongsToTenant, HasFactory, HasUuids;

    /** @return HasMany<Register, $this> */
    public function registers(): HasMany
    {
        return $this->hasMany(Register::class);
    }

    /** @return array{id: string, name: string, code: string} */
    public function toApi(): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'code' => $this->code];
    }
}
