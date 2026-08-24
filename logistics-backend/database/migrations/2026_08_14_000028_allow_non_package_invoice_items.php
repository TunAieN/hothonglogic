<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('invoice_items')) {
            return;
        }

        // Deposit/service invoice lines are not tied to a warehouse package.
        if (Schema::hasColumn('invoice_items', 'vn_package_id')) {
            DB::statement('ALTER TABLE invoice_items MODIFY vn_package_id BIGINT UNSIGNED NULL');
        }
        if (Schema::hasColumn('invoice_items', 'weight')) {
            DB::statement('ALTER TABLE invoice_items MODIFY weight DECIMAL(8, 2) NULL');
        }
        if (Schema::hasColumn('invoice_items', 'shipping_fee')) {
            DB::statement('ALTER TABLE invoice_items MODIFY shipping_fee DECIMAL(15, 2) NULL');
        }
    }

    public function down(): void
    {
        // Non-destructive: existing non-package invoice lines must remain valid.
    }
};
