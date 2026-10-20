<?php

namespace App\Fiscal;

final readonly class FiscalResult
{
    public function __construct(
        public string $status,
        public ?string $reference = null,
        public ?string $message = null,
    ) {}

    public static function notSubmitted(string $reason): self
    {
        return new self('not_submitted', null, $reason);
    }
}
