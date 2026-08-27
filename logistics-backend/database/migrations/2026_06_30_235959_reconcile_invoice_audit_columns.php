<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reconcile invoice audit columns that predate the Laravel migration history.
     */
    public function up(): void
    {
        if (! Schema::hasTable('invoices')) {
            return;
        }

        Schema::table('invoices', function (Blueprint $table) {
            if (! Schema::hasColumn('invoices', 'created_by')) {
                $table->foreignId('created_by')->nullable()->after('customer_id')->constrained('users')->nullOnDelete();
            }

            if (! Schema::hasColumn('invoices', 'confirmed_by')) {
                $table->foreignId('confirmed_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            }

            if (! Schema::hasColumn('invoices', 'confirmed_at')) {
                $table->timestamp('confirmed_at')->nullable()->after('confirmed_by');
            }
        });
    }

    /**
     * Intentionally non-destructive: these columns may predate this migration.
     */
    public function down(): void {}
};
