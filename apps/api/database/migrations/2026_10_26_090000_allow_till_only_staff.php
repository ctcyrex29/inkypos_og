<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Till-only staff (cashiers without an email login): a user with no email and
     * no password, who exists only to sign in on tills with a PIN. Login looks
     * users up by email, so such a person can never use the back office or API.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email')->nullable()->change();
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Till-only users cannot be given an email or password here; refuse rather than lose them.
        if (DB::table('users')->whereNull('email')->exists()) {
            throw new RuntimeException('Till-only staff exist; remove them before rolling back.');
        }
        Schema::table('users', function (Blueprint $table) {
            $table->string('email')->nullable(false)->change();
            $table->string('password')->nullable(false)->change();
        });
    }
};
