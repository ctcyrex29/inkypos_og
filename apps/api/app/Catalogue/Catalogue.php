<?php

namespace App\Catalogue;

use App\Models\Branch;
use App\Models\ExchangeRate;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Register;
use App\Models\Tenant;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * Reference data the tills need offline, and the ordered change log they
 * pull from (GET /api/v1/sync/changes). Every write to that data must call
 * record() in the same transaction.
 */
final class Catalogue
{
    /** Resolved on every use: controllers, services and middleware can outlive a request (route caching, Octane). */
    private function context(): TenantContext
    {
        return app(TenantContext::class);
    }

    public function record(string $entity, string $entityId, string $op = 'upsert'): void
    {
        DB::table('catalogue_changes')->insert([
            'tenant_id' => $this->context()->tenant()->id,
            'entity' => $entity,
            'entity_id' => $entityId,
            'op' => $op,
            'created_at' => now(),
        ]);
    }

    /** Payment types every new business starts with; managers can change them later. */
    public function seedDefaults(): void
    {
        $defaults = [
            ['code' => 'cash', 'name' => 'Cash', 'kind' => 'cash', 'currencies' => ['USD', 'ZWG'], 'initial_status' => 'recorded', 'requires_reference' => false, 'gives_change' => true],
            ['code' => 'ecocash', 'name' => 'EcoCash', 'kind' => 'mobile_money', 'currencies' => ['USD', 'ZWG'], 'initial_status' => 'pending_confirmation', 'requires_reference' => true, 'gives_change' => false],
            ['code' => 'card', 'name' => 'Card (bank terminal)', 'kind' => 'card', 'currencies' => ['USD', 'ZWG'], 'initial_status' => 'recorded', 'requires_reference' => true, 'gives_change' => false],
            ['code' => 'transfer', 'name' => 'Bank transfer / ZIPIT', 'kind' => 'transfer', 'currencies' => ['USD', 'ZWG'], 'initial_status' => 'pending_confirmation', 'requires_reference' => true, 'gives_change' => false],
        ];
        foreach ($defaults as $position => $method) {
            $model = PaymentMethod::create([...$method, 'position' => $position, 'active' => true, 'version' => 1]);
            $this->record('payment_method', $model->id);
        }
        $this->record('business', $this->context()->tenant()->id);
    }

    // ── Payloads sent to tills (mirrored by the zod schemas in packages/core) ──

    /** @return array<string, mixed> */
    public function product(Product $p): array
    {
        return [
            'product_id' => $p->id,
            'sku' => $p->sku,
            'name' => $p->name,
            'unit' => $p->unit,
            'unit_price_minor' => $p->unit_price_minor,
            'tax_code' => $p->tax_code,
            'tax_rate_bp' => $p->tax_rate_bp,
            'tax_inclusive' => $p->tax_inclusive,
            'active' => $p->active,
            'barcodes' => $this->barcodes($p->id),
            'version' => $p->version,
        ];
    }

    /** @return list<string> */
    public function barcodes(string $productId): array
    {
        return DB::table('product_barcodes')->where('tenant_id', $this->context()->id())->where('product_id', $productId)
            ->orderBy('barcode')->pluck('barcode')->all();
    }

    /** @param list<string> $barcodes */
    public function setBarcodes(Product $product, array $barcodes): void
    {
        DB::table('product_barcodes')->where('tenant_id', $product->tenant_id)->where('product_id', $product->id)->delete();
        foreach (array_values(array_unique($barcodes)) as $barcode) {
            DB::table('product_barcodes')->insert(['tenant_id' => $product->tenant_id, 'barcode' => $barcode, 'product_id' => $product->id]);
        }
    }

    /** @return array<string, mixed> */
    public function paymentMethod(PaymentMethod $m): array
    {
        return [
            'id' => $m->id,
            'code' => $m->code,
            'name' => $m->name,
            'kind' => $m->kind,
            'currencies' => $m->currencies,
            'initial_status' => $m->initial_status,
            'requires_reference' => $m->requires_reference,
            'gives_change' => $m->gives_change,
            'active' => $m->active,
            'position' => $m->position,
            'version' => $m->version,
        ];
    }

    /** @return array<string, mixed> */
    public function exchangeRate(ExchangeRate $r): array
    {
        return [
            'id' => $r->id,
            'base_currency' => $r->base_currency,
            'quote_currency' => $r->quote_currency,
            'rate' => $r->rate,
            'version' => $r->version,
            'effective_at' => $r->effective_at->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    public function business(Tenant $t): array
    {
        return ['id' => $t->id, 'name' => $t->name, 'base_currency' => $t->base_currency, 'rounding' => $t->rounding, 'tax_rounding' => $t->tax_rounding];
    }

    /** @return array<string, mixed> */
    public function branch(Branch $b): array
    {
        return ['id' => $b->id, 'name' => $b->name, 'code' => $b->code];
    }

    /** @return array<string, mixed> */
    public function register(Register $r): array
    {
        return ['id' => $r->id, 'branch_id' => $r->branch_id, 'name' => $r->name, 'code' => $r->code];
    }

    /**
     * Current data for one entity, or null when it no longer exists (sent as a delete).
     *
     * @return array<string, mixed>|null
     */
    public function current(string $entity, string $id): ?array
    {
        return match ($entity) {
            'product' => ($m = Product::find($id)) ? $this->product($m) : null,
            'payment_method' => ($m = PaymentMethod::find($id)) ? $this->paymentMethod($m) : null,
            'exchange_rate' => ($m = ExchangeRate::find($id)) ? $this->exchangeRate($m) : null,
            'business' => $id === $this->context()->id() ? $this->business($this->context()->tenant()->refresh()) : null,
            'branch' => ($m = Branch::find($id)) ? $this->branch($m) : null,
            'register' => ($m = Register::find($id)) ? $this->register($m) : null,
            default => null,
        };
    }
}
