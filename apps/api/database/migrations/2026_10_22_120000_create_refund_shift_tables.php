<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->uuid('shift_id')->nullable()->index();
        });

        Schema::create('refunds', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('branch_id');
            $table->uuid('register_id');
            $table->uuid('device_id');
            $table->uuid('event_id');
            $table->uuid('actor_user_id');
            $table->uuid('original_sale_id');
            $table->string('receipt_number', 40);
            $table->string('reason', 24); // customer_return | void | price_adjustment | other
            $table->text('note')->nullable();
            $table->char('currency', 3);
            $table->bigInteger('total_minor');
            $table->bigInteger('tax_minor');
            $table->uuid('shift_id')->nullable()->index();
            $table->timestamp('refunded_at');
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants');
            $table->foreign(['original_sale_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('sales');
            $table->unique(['id', 'tenant_id']);
            $table->index(['tenant_id', 'refunded_at']);
        });

        Schema::create('refund_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('refund_id');
            $table->uuid('original_line_id')->index();
            $table->uuid('product_id');
            $table->bigInteger('quantity_milli');
            $table->bigInteger('amount_minor');
            $table->bigInteger('tax_minor');
            $table->boolean('restock');
            $table->foreign(['refund_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('refunds')->cascadeOnDelete();
        });

        Schema::create('refund_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('refund_id');
            $table->string('method_code', 32);
            $table->char('currency', 3);
            $table->bigInteger('amount_minor');
            $table->bigInteger('sale_currency_amount_minor');
            $table->string('exchange_rate', 32)->nullable();
            $table->string('reference', 128)->nullable();
            $table->foreign(['refund_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('refunds')->cascadeOnDelete();
        });

        Schema::create('shifts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('branch_id');
            $table->uuid('register_id');
            $table->uuid('device_id');
            $table->uuid('opened_by_user_id');
            $table->timestamp('opened_at');
            $table->json('opening_float');
            $table->timestamp('closed_at')->nullable();
            $table->uuid('closed_by_user_id')->nullable();
            // What the till computed and what was counted; the server's own reconciliation comes in Phase 6.
            $table->json('expected_cash')->nullable();
            $table->json('counted_cash')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants');
            $table->index(['tenant_id', 'opened_at']);
        });

        Schema::create('cash_movements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('shift_id')->index();
            $table->uuid('device_id');
            $table->uuid('actor_user_id');
            $table->string('direction', 3); // in | out
            $table->char('currency', 3);
            $table->bigInteger('amount_minor');
            $table->string('reason', 24);
            $table->text('note')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_movements');
        Schema::dropIfExists('shifts');
        Schema::dropIfExists('refund_payments');
        Schema::dropIfExists('refund_lines');
        Schema::dropIfExists('refunds');
        Schema::table('sales', fn (Blueprint $table) => $table->dropColumn('shift_id'));
    }
};
