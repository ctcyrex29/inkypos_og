<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * OG-1 retail depth: categories, product cost and reorder level, customers,
 * suppliers, goods received (purchases), and stock movements recorded in the
 * back office rather than by a till event.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('name', 80);
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('active')->default(true);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->unique(['tenant_id', 'name']);
            $table->unique(['id', 'tenant_id']);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->uuid('category_id')->nullable();
            // Back office only: never sent to tills.
            $table->bigInteger('cost_minor')->nullable(); // last cost per unit, base currency
            $table->bigInteger('reorder_level_milli')->nullable(); // low-stock alert at or below this
            $table->foreign(['category_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('categories');
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('name', 120);
            $table->string('phone', 32)->nullable();
            $table->string('phone_digits', 32)->nullable(); // for search: '+263 77 123 4567' → '263771234567'
            $table->string('email', 254)->nullable();
            $table->string('notes', 500)->nullable();
            $table->boolean('active')->default(true);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->unique(['id', 'tenant_id']);
            $table->index(['tenant_id', 'phone_digits']);
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->uuid('customer_id')->nullable(); // as recorded by the till; may name a customer later removed
            $table->index(['tenant_id', 'customer_id']);
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('name', 120);
            $table->string('contact_person', 120)->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('email', 254)->nullable();
            $table->string('address', 300)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->unique(['tenant_id', 'name']);
            $table->unique(['id', 'tenant_id']);
        });

        // Goods received from a supplier into a branch. Immutable once recorded; corrections are stock adjustments.
        Schema::create('purchases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('branch_id');
            $table->uuid('supplier_id');
            $table->string('reference', 64)->nullable(); // supplier invoice / delivery note number
            $table->timestamp('received_at');
            $table->bigInteger('total_cost_minor');
            $table->string('notes', 500)->nullable();
            $table->uuid('recorded_by_user_id');
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign(['branch_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('branches');
            $table->foreign(['supplier_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('suppliers');
            $table->unique(['id', 'tenant_id']);
            $table->index(['tenant_id', 'received_at']);
        });

        Schema::create('purchase_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('purchase_id');
            $table->uuid('product_id');
            $table->bigInteger('quantity_milli');
            $table->bigInteger('unit_cost_minor');
            $table->bigInteger('line_cost_minor');
            $table->foreign(['purchase_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('purchases')->cascadeOnDelete();
            $table->foreign(['product_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('products');
        });

        // Movements recorded in the back office have no till event behind them.
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->uuid('event_id')->nullable()->change();
            $table->uuid('purchase_id')->nullable();
            $table->uuid('recorded_by_user_id')->nullable();
            $table->string('note', 300)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', fn (Blueprint $table) => $table->dropColumn(['purchase_id', 'recorded_by_user_id', 'note']));
        Schema::dropIfExists('purchase_lines');
        Schema::dropIfExists('purchases');
        Schema::dropIfExists('suppliers');
        Schema::table('sales', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'customer_id']);
            $table->dropColumn('customer_id');
        });
        Schema::dropIfExists('customers');
        Schema::table('products', function (Blueprint $table) {
            $table->dropForeign(['category_id', 'tenant_id']);
            $table->dropColumn(['category_id', 'cost_minor', 'reorder_level_milli']);
        });
        Schema::dropIfExists('categories');
    }
};
