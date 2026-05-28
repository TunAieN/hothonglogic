<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_packages', 'shop_id')) {
                $table->string('shop_id', 100)->nullable()->after('order_id');
            }

            if (! Schema::hasColumn('cn_packages', 'shop_name')) {
                $table->string('shop_name', 255)->nullable()->after('shop_id');
            }
        });

        DB::statement('ALTER TABLE cn_packages MODIFY tracking_number VARCHAR(100) NULL');
    }

    public function down(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            $columns = array_values(array_filter([
                Schema::hasColumn('cn_packages', 'shop_id') ? 'shop_id' : null,
                Schema::hasColumn('cn_packages', 'shop_name') ? 'shop_name' : null,
            ]));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });

        DB::statement("UPDATE cn_packages SET tracking_number = CONCAT('RESTORE', id) WHERE tracking_number IS NULL");
        DB::statement('ALTER TABLE cn_packages MODIFY tracking_number VARCHAR(100) NOT NULL');
    }
};
