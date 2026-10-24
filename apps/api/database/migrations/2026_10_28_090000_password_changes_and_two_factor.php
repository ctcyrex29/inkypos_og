<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A temporary password (from Inkgenius or a reset) must be replaced at the next sign-in.
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('password_must_change')->default(false);
        });

        Schema::table('platform_users', function (Blueprint $table) {
            $table->boolean('password_must_change')->default(false);
            // Authenticator-app codes (TOTP, RFC 6238). The secret is encrypted with APP_KEY.
            $table->text('two_factor_secret')->nullable();
            $table->timestamp('two_factor_confirmed_at')->nullable();
            // The last 30-second step a code was accepted for, so a code works only once.
            $table->unsignedBigInteger('two_factor_last_step')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('password_must_change'));
        Schema::table('platform_users', fn (Blueprint $table) => $table->dropColumn(['password_must_change', 'two_factor_secret', 'two_factor_confirmed_at', 'two_factor_last_step']));
    }
};
