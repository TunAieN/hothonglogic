<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            if (! Schema::hasColumn('order_items', 'shop_id')) {
                $table->string('shop_id', 100)->nullable()->after('seller');
            }

            if (! Schema::hasColumn('order_items', 'shop_name')) {
                $table->string('shop_name', 255)->nullable()->after('shop_id');
            }
        });

        if (Schema::hasColumn('order_items', 'seller') && Schema::hasColumn('order_items', 'shop_name')) {
            DB::table('order_items')
                ->whereNull('shop_name')
                ->update([
                    'shop_name' => DB::raw('seller'),
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $columns = array_values(array_filter([
                Schema::hasColumn('order_items', 'shop_id') ? 'shop_id' : null,
                Schema::hasColumn('order_items', 'shop_name') ? 'shop_name' : null,
            ]));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
