<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reconcile order columns that predate the Laravel migration history.
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'order_code')) {
                $table->string('order_code', 50)->nullable()->unique()->after('id');
            }

            if (! Schema::hasColumn('orders', 'customer_id')) {
                $table->foreignId('customer_id')->nullable()->after('order_code')->constrained('customers')->nullOnDelete();
            }

            if (! Schema::hasColumn('orders', 'status')) {
                $table->string('status', 30)->default('pending')->after('customer_id');
            }

            if (! Schema::hasColumn('orders', 'total_amount')) {
                $table->decimal('total_amount', 15, 2)->default(0)->after('status');
            }

            if (! Schema::hasColumn('orders', 'note')) {
                $table->text('note')->nullable()->after('total_amount');
            }

            if (! Schema::hasColumn('orders', 'created_by')) {
                $table->foreignId('created_by')->nullable()->after('note')->constrained('users')->nullOnDelete();
            }

            if (! Schema::hasColumn('orders', 'approved_by')) {
                $table->foreignId('approved_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            }

            if (! Schema::hasColumn('orders', 'approved_at')) {
                $table->timestamp('approved_at')->nullable()->after('approved_by');
            }

            if (! Schema::hasColumn('orders', 'account_manager_id')) {
                $table->foreignId('account_manager_id')->nullable()->after('approved_at')->constrained('users')->nullOnDelete();
            }
        });
    }

    /**
     * Intentionally non-destructive: these columns may predate this migration.
     */
    public function down(): void {}
};
