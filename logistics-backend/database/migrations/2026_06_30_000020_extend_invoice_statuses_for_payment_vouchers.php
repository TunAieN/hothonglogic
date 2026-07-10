<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('invoices') && Schema::hasColumn('invoices', 'status')) {
            DB::statement("ALTER TABLE invoices MODIFY status ENUM('pending','confirmed','cancelled','issued','voided') NULL DEFAULT 'pending'");
        }
    }

    public function down(): void
    {
        // Non-destructive: keep expanded invoice statuses for compatibility with existing payment vouchers.
    }
};
