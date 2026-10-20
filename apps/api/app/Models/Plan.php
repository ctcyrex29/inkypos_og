<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property array{max_branches: int, max_registers: int} $limits
 * @property list<string> $features
 */
#[Fillable(['code', 'name', 'limits', 'features', 'is_active'])]
class Plan extends Model
{
    use HasFactory, HasUuids;

    protected function casts(): array
    {
        return ['limits' => 'array', 'features' => 'array', 'is_active' => 'boolean'];
    }

    public function limit(string $key): int
    {
        return (int) ($this->limits[$key] ?? 0);
    }
}
