<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipping_tasks', function (Blueprint $table) {
            if (! Schema::hasColumn('shipping_tasks', 'estimated_shipping_fee')) {
                $table->decimal('estimated_shipping_fee', 18, 0)->default(0)->after('delivery_method');
            }
            if (! Schema::hasColumn('shipping_tasks', 'cod_amount')) {
                $table->decimal('cod_amount', 18, 0)->nullable()->after('estimated_shipping_fee');
            }
        });
    }

    public function down(): void
    {
        $columns = array_values(array_filter(
            ['estimated_shipping_fee', 'cod_amount'],
            fn (string $column) => Schema::hasColumn('shipping_tasks', $column)
        ));
        if ($columns !== []) {
            Schema::table('shipping_tasks', fn (Blueprint $table) => $table->dropColumn($columns));
        }
    }
};
