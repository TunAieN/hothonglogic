<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('vn_packages', 'storage_location')) {
            Schema::table('vn_packages', function (Blueprint $table) {
                $table->dropColumn('storage_location');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('vn_packages', 'storage_location')) {
            Schema::table('vn_packages', function (Blueprint $table) {
                $table->string('storage_location', 100)->nullable()->after('physical_condition');
            });
        }
    }
};
