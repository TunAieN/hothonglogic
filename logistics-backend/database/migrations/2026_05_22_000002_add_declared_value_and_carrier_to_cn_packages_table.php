<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_packages', 'declared_value')) {
                $table->decimal('declared_value', 12, 2)->default(0)->after('tracking_number');
            }

            if (! Schema::hasColumn('cn_packages', 'carrier')) {
                $table->string('carrier', 100)->default('VN Express')->after('declared_value');
            }
        });
    }

    public function down(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            $columns = array_values(array_filter([
                Schema::hasColumn('cn_packages', 'declared_value') ? 'declared_value' : null,
                Schema::hasColumn('cn_packages', 'carrier') ? 'carrier' : null,
            ]));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
