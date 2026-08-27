<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vn_batch_receipts', function (Blueprint $table) {
            $table->unsignedInteger('actual_container_count')->nullable()->after('batch_code');
            $table->string('outer_condition', 30)->default('normal')->after('actual_volume');
            $table->decimal('batch_weight_difference', 10, 2)->nullable()->after('outer_condition');
            $table->boolean('requires_resolution')->default(false)->after('batch_weight_difference');
            $table->dateTime('received_at')->nullable()->after('handled_by');
        });

        Schema::table('vn_packages', function (Blueprint $table) {
            $table->decimal('cn_weight_snapshot', 10, 2)->nullable()->after('tracking_number_snapshot');
            $table->decimal('weight_difference', 10, 2)->nullable()->after('actual_weight');
            $table->string('physical_condition', 30)->default('normal')->after('actual_volume');
            $table->boolean('requires_item_inspection')->default(false)->after('physical_condition');
            $table->string('item_inspection_status', 30)->default('not_required')->after('requires_item_inspection');
            $table->text('exception_reason')->nullable()->after('item_inspection_status');
        });

        Schema::create('vn_package_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vn_package_id')->constrained('vn_packages')->cascadeOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained('order_items')->nullOnDelete();
            $table->string('product_name_snapshot');
            $table->string('variant_snapshot')->nullable();
            $table->unsignedInteger('expected_quantity')->default(0);
            $table->unsignedInteger('received_quantity')->default(0);
            $table->string('condition_status', 30)->default('normal');
            $table->text('note')->nullable();
            $table->timestamps();

            $table->unique(['vn_package_id', 'order_item_id'], 'vn_package_items_package_order_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vn_package_items');

        Schema::table('vn_packages', function (Blueprint $table) {
            $table->dropColumn([
                'cn_weight_snapshot',
                'weight_difference',
                'physical_condition',
                'requires_item_inspection',
                'item_inspection_status',
                'exception_reason',
            ]);
        });

        Schema::table('vn_batch_receipts', function (Blueprint $table) {
            $table->dropColumn([
                'actual_container_count',
                'outer_condition',
                'batch_weight_difference',
                'requires_resolution',
                'received_at',
            ]);
        });
    }
};
