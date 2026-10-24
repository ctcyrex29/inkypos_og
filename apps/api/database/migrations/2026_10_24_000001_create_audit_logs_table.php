<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users');
            $table->string('action'); // create, update, delete, activate, etc.
            $table->string('resource_type'); // business, user, subscription, device, staff
            $table->string('resource_id');
            $table->string('resource_name');
            $table->json('changes')->nullable(); // old/new values
            $table->string('ip_address');
            $table->string('status')->default('success'); // success, failed
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['action', 'resource_type']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
