<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('support_tickets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained('businesses');
            $table->foreignId('created_by_user_id')->constrained('users');
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users');
            $table->string('ticket_number')->unique();
            $table->string('subject');
            $table->text('description');
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            $table->enum('status', ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'])->default('open');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->unsignedInteger('message_count')->default(1);
            $table->timestamps();

            $table->index(['business_id', 'status']);
            $table->index(['status', 'priority']);
            $table->index(['assigned_to_user_id']);
            $table->index(['created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_tickets');
    }
};
