<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * OG-3 restaurant mode: business type, product options, recipes (ingredients
 * deducted when a dish is sold), and order details on sales. Open orders stay
 * on the till until paid, so there is no orders table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('business_type', 16)->default('retail'); // retail | restaurant
        });

        Schema::table('products', function (Blueprint $table) {
            $table->json('option_groups')->nullable();
            // Dishes made to order are not counted as stock; their ingredients are.
            $table->boolean('track_stock')->default(true);
        });

        // What one unit of a product (or one choice of an option) uses up.
        Schema::create('recipe_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('product_id');
            $table->uuid('option_id')->nullable(); // null: every unit of the product; else only when this option is chosen
            $table->uuid('ingredient_id');
            $table->bigInteger('quantity_milli');
            $table->foreign(['product_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('products')->cascadeOnDelete();
            $table->foreign(['ingredient_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('products');
            $table->index(['tenant_id', 'product_id']);
        });

        Schema::table('sale_lines', function (Blueprint $table) {
            $table->json('options')->nullable();
            $table->string('note', 200)->nullable();
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->unsignedInteger('order_number')->nullable();
            $table->string('service_type', 16)->nullable(); // sit_in | takeaway
            $table->string('table_label', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('sales', fn (Blueprint $table) => $table->dropColumn(['order_number', 'service_type', 'table_label']));
        Schema::table('sale_lines', fn (Blueprint $table) => $table->dropColumn(['options', 'note']));
        Schema::dropIfExists('recipe_items');
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn(['option_groups', 'track_stock']));
        Schema::table('tenants', fn (Blueprint $table) => $table->dropColumn('business_type'));
    }
};
