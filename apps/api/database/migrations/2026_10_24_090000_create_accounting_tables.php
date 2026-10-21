<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * OG-2 reports and accounting: the business's time zone (reports group by its
 * local day), expenses paid outside the till drawer, and payments to suppliers.
 * Cash taken from a till drawer stays a till cash.movement event.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('timezone', 64)->default('Africa/Harare');
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('branch_id')->nullable();
            $table->string('category', 40); // rent | utilities | wages | transport | supplies | repairs | other
            $table->string('description', 200);
            $table->char('currency', 3);
            $table->bigInteger('amount_minor');
            $table->string('paid_from', 16); // bank | mobile_money | cash_office | other
            $table->string('reference', 64)->nullable();
            $table->timestamp('spent_at');
            $table->uuid('recorded_by_user_id');
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign(['branch_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('branches');
            $table->index(['tenant_id', 'spent_at']);
        });

        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('supplier_id');
            $table->char('currency', 3);
            $table->bigInteger('amount_minor');
            $table->string('paid_from', 16);
            $table->string('reference', 64)->nullable();
            $table->timestamp('paid_at');
            $table->uuid('recorded_by_user_id');
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign(['supplier_id', 'tenant_id'])->references(['id', 'tenant_id'])->on('suppliers');
            $table->index(['tenant_id', 'paid_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_payments');
        Schema::dropIfExists('expenses');
        Schema::table('tenants', fn (Blueprint $table) => $table->dropColumn('timezone'));
    }
};
