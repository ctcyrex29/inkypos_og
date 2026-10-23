<?php

namespace App\Support;

use Illuminate\Contracts\Database\Query\Builder;

/**
 * Text search with LIKE, safely. The value is always a bound parameter (no SQL
 * injection); on top of that, % and _ typed by a user match themselves instead
 * of acting as wildcards, and terms are capped so a search cannot become an
 * expensive scan pattern. "!" is the escape character because it means the
 * same in SQLite and MySQL (a backslash does not).
 */
final class Like
{
    public const MAX_LENGTH = 100;

    public static function escape(string $term): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_substr($term, 0, self::MAX_LENGTH));
    }

    /** where <column> contains <term> */
    public static function contains(Builder $query, string $column, string $term, string $boolean = 'and'): Builder
    {
        return $query->whereRaw($query->getGrammar()->wrap($column)." LIKE ? ESCAPE '!'", ['%'.self::escape($term).'%'], $boolean);
    }

    /** where <column> starts with <term> */
    public static function startsWith(Builder $query, string $column, string $term): Builder
    {
        return $query->whereRaw($query->getGrammar()->wrap($column)." LIKE ? ESCAPE '!'", [self::escape($term).'%']);
    }
}
