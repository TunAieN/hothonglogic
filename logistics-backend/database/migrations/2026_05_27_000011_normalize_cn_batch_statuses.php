<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cn_batches') || ! Schema::hasColumn('cn_batches', 'status')) {
            return;
        }

        DB::statement("
            ALTER TABLE cn_batches
            MODIFY status ENUM(
                'new',
                'imported_to_vn',
                'pending',
                'exporting',
                'arrived_vn',
                'completed',
                'cancelled'
            ) NOT NULL DEFAULT 'pending'
        ");

        DB::table('cn_batches')
            ->where('status', 'new')
            ->update(['status' => 'pending']);

        DB::table('cn_batches')
            ->where('status', 'imported_to_vn')
            ->update(['status' => 'arrived_vn']);

        DB::table('cn_batches')
            ->whereNotIn('status', ['pending', 'exporting', 'arrived_vn', 'completed', 'cancelled'])
            ->update(['status' => 'pending']);

        DB::statement("
            ALTER TABLE cn_batches
            MODIFY status ENUM(
                'pending',
                'exporting',
                'arrived_vn',
                'completed',
                'cancelled'
            ) NOT NULL DEFAULT 'pending'
        ");
    }

    public function down(): void
    {
        if (! Schema::hasTable('cn_batches') || ! Schema::hasColumn('cn_batches', 'status')) {
            return;
        }

        DB::statement("
            ALTER TABLE cn_batches
            MODIFY status ENUM(
                'new',
                'imported_to_vn',
                'pending',
                'exporting',
                'arrived_vn',
                'completed',
                'cancelled'
            ) NOT NULL DEFAULT 'new'
        ");

        DB::table('cn_batches')
            ->where('status', 'pending')
            ->update(['status' => 'new']);

        DB::table('cn_batches')
            ->where('status', 'arrived_vn')
            ->update(['status' => 'imported_to_vn']);

        DB::table('cn_batches')
            ->whereIn('status', ['exporting', 'completed', 'cancelled'])
            ->update(['status' => 'new']);

        DB::statement("
            ALTER TABLE cn_batches
            MODIFY status ENUM(
                'new',
                'imported_to_vn'
            ) NOT NULL DEFAULT 'new'
        ");
    }
};
