<?php

namespace App\Fiscal;

/** Bound until a verified provider exists. Makes no network calls and claims no compliance. */
final class DisabledFiscalProvider implements FiscalProvider
{
    public function name(): string
    {
        return 'disabled';
    }

    public function isEnabled(): bool
    {
        return false;
    }

    public function submitSale(array $sale): FiscalResult
    {
        return FiscalResult::notSubmitted('Fiscalisation is disabled pending regulatory verification.');
    }
}
