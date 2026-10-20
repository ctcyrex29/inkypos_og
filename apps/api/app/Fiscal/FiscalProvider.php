<?php

namespace App\Fiscal;

/**
 * Provider-neutral fiscalisation port (Phase 8).
 *
 * No real provider exists yet. Endpoints, certificates, signing rules and
 * receipt fields must come from the verified regulatory requirements and the
 * authorised integration route. Until then the disabled provider is bound.
 */
interface FiscalProvider
{
    /** Stable identifier of the provider implementation, e.g. "disabled". */
    public function name(): string;

    public function isEnabled(): bool;

    /**
     * Submit a completed sale for fiscalisation.
     *
     * @param  array<string, mixed>  $sale  Central sale record, shaped by the provider adapter.
     */
    public function submitSale(array $sale): FiscalResult;
}
