<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Businesses have two roles now: manager and cashier. Owners become managers,
        // and tills hear about it through the change feed like any staff change.
        $owners = DB::table('memberships')->where('role', 'owner')->get(['id', 'tenant_id', 'user_id']);
        foreach ($owners as $m) {
            DB::table('memberships')->where('id', $m->id)->update(['role' => 'manager', 'version' => DB::raw('version + 1')]);
            DB::table('catalogue_changes')->insert(['tenant_id' => $m->tenant_id, 'entity' => 'staff', 'entity_id' => $m->user_id, 'op' => 'upsert', 'created_at' => now()]);
        }

        // Activation by Inkgenius Technologies: who activated or suspended a business, and when.
        Schema::table('tenants', function (Blueprint $table) {
            $table->timestamp('activated_at')->nullable();
            $table->uuid('activated_by')->nullable(); // platform_users.id
            $table->string('status_reason', 255)->nullable();
        });
        // Businesses that already exist were in use, so they count as activated.
        DB::table('tenants')->where('status', 'active')->update(['activated_at' => now()]);

        // Inkgenius Technologies staff: a separate kind of account from business staff.
        Schema::create('platform_users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('role', 24); // administrator | support | technician | accounts
            $table->timestamp('deactivated_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_users');
        Schema::table('tenants', fn (Blueprint $table) => $table->dropColumn(['activated_at', 'activated_by', 'status_reason']));
        // Managers are not turned back into owners: which of them were owners is not kept.
    }
};
