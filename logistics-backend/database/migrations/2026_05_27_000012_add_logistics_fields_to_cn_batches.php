<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cn_batches')) {
            return;
        }

        Schema::table('cn_batches', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_batches', 'destination_warehouse_name')) {
                $table->string('destination_warehouse_name', 150)->nullable()->after('warehouse_id');
            }

            if (! Schema::hasColumn('cn_batches', 'shipping_type')) {
                $table->string('shipping_type', 20)->default('normal')->after('status');
            }

            if (! Schema::hasColumn('cn_batches', 'departed_at')) {
                $table->dateTime('departed_at')->nullable()->after('shipping_type');
            }

            if (! Schema::hasColumn('cn_batches', 'expected_arrival_at')) {
                $table->dateTime('expected_arrival_at')->nullable()->after('departed_at');
            }

            if (! Schema::hasColumn('cn_batches', 'arrived_at')) {
                $table->dateTime('arrived_at')->nullable()->after('expected_arrival_at');
            }
        });

        if (Schema::hasColumn('cn_batches', 'shipping_type')) {
            DB::table('cn_batches')
                ->whereNull('shipping_type')
                ->update(['shipping_type' => 'normal']);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('cn_batches')) {
            return;
        }

        Schema::table('cn_batches', function (Blueprint $table) {
            foreach ([
                'arrived_at',
                'expected_arrival_at',
                'departed_at',
                'shipping_type',
                'destination_warehouse_name',
            ] as $column) {
                if (Schema::hasColumn('cn_batches', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
