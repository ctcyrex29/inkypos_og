<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Every event a device ever uploaded, exactly once per tenant. Never updated or deleted.
        Schema::create('sync_events', function (Blueprint $table) {
            $table->id('server_sequence');
            $table->uuid('tenant_id');
            $table->uuid('event_id');
            $table->uuid('device_id');
            $table->unsignedBigInteger('device_sequence');
            $table->string('event_type', 40);
            $table->unsignedSmallInteger('schema_version');
            $table->char('payload_hash', 64); // sha256 of canonical JSON
            $table->json('payload');
            $table->string('result', 16); // accepted | conflict | rejected
            $table->uuid('conflict_id')->nullable();
            $table->string('error_code', 64)->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->timestamp('received_at');
            $table->foreign('tenant_id')->references('id')->on('tenants');
            $table->unique(['tenant_id', 'event_id']);
            $table->unique(['device_id', 'device_sequence']);
        });

        Schema::create('sync_conflicts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('device_id');
            $table->uuid('event_id')->nullable();
            $table->string('type', 40); // event_id_reused | sequence_reused | sequence_gap | sale_id_reused
            $table->json('details');
            $table->string('status', 16)->default('open'); // open | resolved
            $table->timestamp('resolved_at')->nullable();
            $table->uuid('resolved_by_user_id')->nullable();
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants');
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('sales', function (Blueprint $table) {
            $table->uuid('id')->primary(); // device-generated sale_id
            $table->uuid('tenant_id');
            $table->uuid('branch_id');
            $table->uuid('register_id');
            $table->uuid('device_id');
            $table->uuid('event_id');
            $table->uuid('actor_user_id');
            $table->string('receipt_number', 40);
            $table->char('currency', 3);
            $table->string('rounding', 24);
            $table->bigInteger('subtotal_minor');
            $table->bigInteger('discount_minor');
            $table->bigInteger('tax_minor');
            $table->bigInteger('total_minor');
            $table->bigInteger('change_minor');
            $table->unsignedInteger('catalogue_version');
            $table->unsignedInteger('price_list_version');
            $table->timestamp('completed_at');
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants');
            $table->foreign(['branch_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('branches');
            $table->foreign(['register_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('registers');
            $table->unique(['id', 'tenant_id']);
            $table->index(['tenant_id', 'completed_at']);
        });

        Schema::create('sale_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('sale_id');
            $table->unsignedSmallInteger('position');
            $table->uuid('product_id');
            $table->string('sku', 64);
            $table->string('name', 200);
            $table->bigInteger('quantity_milli');
            $table->bigInteger('unit_price_minor');
            $table->bigInteger('discount_minor');
            $table->string('tax_code', 32);
            $table->unsignedInteger('tax_rate_bp');
            $table->boolean('tax_inclusive');
            $table->bigInteger('tax_minor');
            $table->bigInteger('line_total_minor');
            $table->foreign(['sale_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('sales')->cascadeOnDelete();
        });

        Schema::create('sale_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('sale_id');
            $table->string('method_code', 32);
            $table->string('status', 24); // what the till recorded; never implies settlement
            $table->char('currency', 3);
            $table->bigInteger('amount_minor');
            $table->bigInteger('sale_currency_amount_minor');
            $table->string('exchange_rate', 32)->nullable();
            $table->unsignedInteger('exchange_rate_version')->nullable();
            $table->string('reference', 128)->nullable();
            $table->foreign(['sale_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('sales')->cascadeOnDelete();
            $table->index(['tenant_id', 'status']);
        });

        // Append-only stock ledger; on-hand is always derived, never stored and overwritten.
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('branch_id');
            $table->uuid('product_id');
            $table->bigInteger('quantity_delta_milli');
            $table->string('reason', 24); // sale | adjustment | ...
            $table->uuid('sale_id')->nullable();
            $table->uuid('device_id')->nullable();
            $table->uuid('event_id');
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('tenant_id')->references('id')->on('tenants');
            $table->foreign(['branch_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('branches');
            $table->index(['tenant_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('sale_payments');
        Schema::dropIfExists('sale_lines');
        Schema::dropIfExists('sales');
        Schema::dropIfExists('sync_conflicts');
        Schema::dropIfExists('sync_events');
    }
};
