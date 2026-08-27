<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('cn_batches', 'seal_code')) {
            Schema::table('cn_batches', function (Blueprint $table) {
                $table->dropColumn('seal_code');
            });
        }
    }

    public function down(): void
    {
        // The field is intentionally retired and should not be recreated.
    }
};
