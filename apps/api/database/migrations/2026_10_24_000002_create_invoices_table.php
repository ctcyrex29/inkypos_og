<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained('businesses');
            $table->string('invoice_number')->unique();
            $table->unsignedBigInteger('amount_minor'); // in cents/smallest unit
            $table->string('currency')->default('USD');
            $table->enum('status', ['draft', 'sent', 'paid', 'overdue', 'refunded'])->default('draft');
            $table->timestamp('issued_at');
            $table->timestamp('due_at');
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->text('description')->nullable();
            $table->json('items')->nullable(); // line items
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['business_id', 'status']);
            $table->index(['status', 'due_at']);
            $table->index(['issued_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
