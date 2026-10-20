<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Till sign-in for staff (docs/ARCHITECTURE.md §7). The PIN is per business, so it
        // lives on the membership. Only a slow hash is stored; tills receive it to verify offline.
        Schema::table('memberships', function (Blueprint $table) {
            $table->string('pin_algorithm', 24)->nullable(); // pbkdf2-sha256
            $table->unsignedInteger('pin_iterations')->nullable();
            $table->string('pin_salt', 64)->nullable(); // base64url
            $table->string('pin_hash', 64)->nullable(); // base64url
            $table->timestamp('pin_set_at')->nullable();
            $table->timestamp('deactivated_at')->nullable(); // null = active
            $table->unsignedInteger('version')->default(1);
        });
    }

    public function down(): void
    {
        Schema::table('memberships', fn (Blueprint $table) => $table->dropColumn([
            'pin_algorithm', 'pin_iterations', 'pin_salt', 'pin_hash', 'pin_set_at', 'deactivated_at', 'version',
        ]));
    }
};
