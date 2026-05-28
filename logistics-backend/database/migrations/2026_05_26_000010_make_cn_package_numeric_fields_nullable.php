<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cn_packages')) {
            return;
        }

        if (Schema::hasColumn('cn_packages', 'declared_value')) {
            DB::statement('ALTER TABLE cn_packages MODIFY declared_value DECIMAL(12,2) NULL');
        }

        if (Schema::hasColumn('cn_packages', 'weight')) {
            DB::statement('ALTER TABLE cn_packages MODIFY weight DECIMAL(8,2) NULL');
        }

        if (Schema::hasColumn('cn_packages', 'volume')) {
            DB::statement('ALTER TABLE cn_packages MODIFY volume DECIMAL(10,2) NULL');
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('cn_packages')) {
            return;
        }

        if (Schema::hasColumn('cn_packages', 'declared_value')) {
            DB::statement('ALTER TABLE cn_packages MODIFY declared_value DECIMAL(12,2) NOT NULL DEFAULT 0');
        }

        if (Schema::hasColumn('cn_packages', 'weight')) {
            DB::statement('ALTER TABLE cn_packages MODIFY weight DECIMAL(8,2) NULL');
        }

        if (Schema::hasColumn('cn_packages', 'volume')) {
            DB::statement('ALTER TABLE cn_packages MODIFY volume DECIMAL(10,2) NULL');
        }
    }
};
