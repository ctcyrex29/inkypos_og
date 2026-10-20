<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->char('base_currency', 3)->default('USD');
            $table->string('rounding', 24)->default('half_away_from_zero');
            $table->string('tax_rounding', 16)->default('per_line'); // per_line only, for now
        });

        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('sku', 64);
            $table->string('name', 200);
            $table->bigInteger('unit_price_minor'); // in the tenant's base currency
            $table->string('unit', 8)->default('each'); // each | kg | l (quantities in thousandths either way)
            $table->string('tax_code', 32);
            $table->unsignedInteger('tax_rate_bp');
            $table->boolean('tax_inclusive')->default(true);
            $table->boolean('active')->default(true);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->unique(['tenant_id', 'sku']);
            $table->unique(['id', 'tenant_id']);
        });

        Schema::create('product_barcodes', function (Blueprint $table) {
            $table->uuid('tenant_id');
            $table->string('barcode', 64);
            $table->uuid('product_id');
            $table->primary(['tenant_id', 'barcode']);
            $table->foreign(['product_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('products')->cascadeOnDelete();
        });

        Schema::create('payment_methods', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('code', 32);
            $table->string('name', 80);
            $table->string('kind', 16); // cash | mobile_money | card | transfer
            $table->json('currencies');
            $table->string('initial_status', 24); // recorded | pending_confirmation
            $table->boolean('requires_reference')->default(false);
            $table->boolean('gives_change')->default(false);
            $table->boolean('active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->unique(['tenant_id', 'code']);
        });

        // Sale-currency units per one unit of the quote currency, as set by a manager.
        Schema::create('exchange_rates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->char('base_currency', 3);
            $table->char('quote_currency', 3);
            $table->string('rate', 32); // decimal string, up to 8 places
            $table->unsignedInteger('version');
            $table->timestamp('effective_at');
            $table->uuid('set_by_user_id');
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->unique(['tenant_id', 'base_currency', 'quote_currency', 'version']);
        });

        // Ordered log of reference-data changes; tills pull everything after their cursor.
        Schema::create('catalogue_changes', function (Blueprint $table) {
            $table->id('seq');
            $table->uuid('tenant_id');
            $table->string('entity', 24); // product | payment_method | exchange_rate | business | branch | register
            $table->uuid('entity_id');
            $table->string('op', 8); // upsert | delete
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->index(['tenant_id', 'seq']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalogue_changes');
        Schema::dropIfExists('exchange_rates');
        Schema::dropIfExists('payment_methods');
        Schema::dropIfExists('product_barcodes');
        Schema::dropIfExists('products');
        Schema::table('tenants', fn (Blueprint $table) => $table->dropColumn(['base_currency', 'rounding', 'tax_rounding']));
    }
};
