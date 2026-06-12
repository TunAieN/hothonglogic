<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('orders') && Schema::hasColumn('orders', 'status')) {
            DB::statement("
                ALTER TABLE orders
                MODIFY COLUMN status ENUM(
                    'pending',
                    'awaiting_deposit',
                    'deposited',
                    'purchasing',
                    'awaiting_tracking',
                    'waiting_cn_warehouse',
                    'receiving',
                    'shipped',
                    'delivered',
                    'completed',
                    'complaint',
                    'cancelled'
                ) NOT NULL DEFAULT 'pending'
            ");
        }

        if (Schema::hasTable('order_trackings') && ! Schema::hasColumn('order_trackings', 'dispatched_at')) {
            Schema::table('order_trackings', function (Blueprint $table) {
                $table->timestamp('dispatched_at')->nullable()->after('declared_value');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('order_trackings') && Schema::hasColumn('order_trackings', 'dispatched_at')) {
            Schema::table('order_trackings', function (Blueprint $table) {
                $table->dropColumn('dispatched_at');
            });
        }

        if (Schema::hasTable('orders') && Schema::hasColumn('orders', 'status')) {
            DB::table('orders')
                ->where('status', 'waiting_cn_warehouse')
                ->update(['status' => 'awaiting_tracking']);

            DB::statement("
                ALTER TABLE orders
                MODIFY COLUMN status ENUM(
                    'pending',
                    'awaiting_deposit',
                    'deposited',
                    'purchasing',
                    'awaiting_tracking',
                    'receiving',
                    'shipped',
                    'delivered',
                    'completed',
                    'complaint',
                    'cancelled'
                ) NOT NULL DEFAULT 'pending'
            ");
        }
    }
};
