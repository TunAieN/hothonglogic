<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reconcile a legacy column used by the active CN batch workflow.
     */
    public function up(): void
    {
        if (! Schema::hasTable('cn_batches') || Schema::hasColumn('cn_batches', 'total_packages')) {
            return;
        }

        Schema::table('cn_batches', function (Blueprint $table) {
            $table->unsignedInteger('total_packages')->default(0)->after('warehouse_id');
        });
    }

    /**
     * Intentionally non-destructive: this column may predate the migration history.
     */
    public function down(): void {}
};
