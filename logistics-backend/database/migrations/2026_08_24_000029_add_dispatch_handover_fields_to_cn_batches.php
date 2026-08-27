<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cn_batches')) {
            return;
        }

        Schema::table('cn_batches', function (Blueprint $table) {
            $table->string('packaging_type', 30)->nullable()->after('shipping_type');
            $table->unsignedInteger('transport_container_count')->nullable()->after('packaging_type');
            $table->decimal('actual_batch_weight', 10, 2)->nullable()->after('total_weight');
            $table->decimal('package_material_weight', 10, 2)->nullable()->after('actual_batch_weight');
            $table->decimal('actual_length', 10, 2)->nullable()->after('package_material_weight');
            $table->decimal('actual_width', 10, 2)->nullable()->after('actual_length');
            $table->decimal('actual_height', 10, 2)->nullable()->after('actual_width');
            $table->decimal('actual_volume', 12, 4)->nullable()->after('actual_height');
            $table->string('carrier_name', 150)->nullable()->after('actual_volume');
            $table->string('transport_code', 100)->nullable()->after('carrier_name');
            $table->string('route_name', 150)->nullable()->after('transport_code');
            $table->string('vehicle_plate', 50)->nullable()->after('route_name');
            $table->string('driver_name', 100)->nullable()->after('vehicle_plate');
            $table->string('driver_phone', 30)->nullable()->after('driver_name');
            $table->decimal('freight_cost', 14, 2)->nullable()->after('driver_phone');
            $table->unsignedBigInteger('handed_over_by')->nullable()->after('freight_cost');
            $table->dateTime('handed_over_at')->nullable()->after('handed_over_by');
            $table->json('dispatch_snapshot')->nullable()->after('handed_over_at');
            $table->text('dispatch_note')->nullable()->after('dispatch_snapshot');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('cn_batches')) {
            return;
        }

        Schema::table('cn_batches', function (Blueprint $table) {
            $table->dropColumn([
                'packaging_type',
                'transport_container_count',
                'actual_batch_weight',
                'package_material_weight',
                'actual_length',
                'actual_width',
                'actual_height',
                'actual_volume',
                'carrier_name',
                'transport_code',
                'route_name',
                'vehicle_plate',
                'driver_name',
                'driver_phone',
                'freight_cost',
                'handed_over_by',
                'handed_over_at',
                'dispatch_snapshot',
                'dispatch_note',
            ]);
        });
    }
};
