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
            if (! Schema::hasColumn('cn_packages', 'seller')) {
                $table->string('seller', 255)->nullable()->after('order_id');
            }
        });

        if (Schema::hasColumn('cn_packages', 'shop_name') && Schema::hasColumn('cn_packages', 'seller')) {
            DB::table('cn_packages')
                ->whereNull('seller')
                ->update([
                    'seller' => DB::raw('shop_name'),
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (Schema::hasColumn('cn_packages', 'seller')) {
                $table->dropColumn('seller');
            }
        });
    }
};
