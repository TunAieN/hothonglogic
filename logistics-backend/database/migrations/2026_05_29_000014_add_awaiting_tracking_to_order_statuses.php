<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('orders') || ! Schema::hasColumn('orders', 'status')) {
            return;
        }

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

    public function down(): void
    {
        if (! Schema::hasTable('orders') || ! Schema::hasColumn('orders', 'status')) {
            return;
        }

        DB::table('orders')
            ->where('status', 'awaiting_tracking')
            ->update(['status' => 'purchasing']);

        DB::statement("
            ALTER TABLE orders
            MODIFY COLUMN status ENUM(
                'pending',
                'awaiting_deposit',
                'deposited',
                'purchasing',
                'receiving',
                'shipped',
                'delivered',
                'completed',
                'complaint',
                'cancelled'
            ) NOT NULL DEFAULT 'pending'
        ");
    }
};
