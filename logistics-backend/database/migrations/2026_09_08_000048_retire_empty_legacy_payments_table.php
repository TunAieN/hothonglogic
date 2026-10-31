<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payments')) {
            return;
        }
        $count = DB::table('payments')->count();
        if ($count !== 0) {
            throw new RuntimeException("Legacy payments retirement aborted: {$count} row(s) still exist.");
        }

        Schema::drop('payments');
    }

    public function down(): void
    {
        // The legacy table is intentionally not recreated. payment_transactions is authoritative.
    }
};
