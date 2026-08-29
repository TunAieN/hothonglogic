<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('shipping_rate_details') && Schema::hasColumn('shipping_rate_details', 'weight_to')) {
            DB::statement('ALTER TABLE shipping_rate_details MODIFY weight_to DECIMAL(8, 2) NULL');
        }
    }

    public function down(): void
    {
        // Keep nullable: existing open-ended ranges cannot be converted back safely.
    }
};
