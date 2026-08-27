<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reconcile tables that predate the Laravel migration history.
     */
    public function up(): void
    {
        if (! Schema::hasTable('roles')) {
            Schema::create('roles', function (Blueprint $table) {
                $table->id();
                $table->string('name', 50)->unique();
                $table->json('permissions')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('customers')) {
            Schema::create('customers', function (Blueprint $table) {
                $table->id();
                $table->string('code', 50)->unique();
                $table->string('name', 100);
                $table->string('vip_group', 50)->nullable();
                $table->string('phone', 20);
                $table->string('email', 100)->nullable();
                $table->string('province', 100)->nullable();
                $table->string('district', 100)->nullable();
                $table->string('ward', 100)->nullable();
                $table->text('address')->nullable();
                $table->text('note')->nullable();
                $table->string('status', 20)->default('active');
                $table->timestamps();
            });
        }
    }

    /**
     * Intentionally non-destructive: these tables may predate this migration.
     */
    public function down(): void {}
};
