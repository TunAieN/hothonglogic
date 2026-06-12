<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('vn_warehouses')) {
            Schema::create('vn_warehouses', function (Blueprint $table) {
                $table->id();
                $table->string('code', 20)->unique();
                $table->string('name', 100);
                $table->text('address')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('vn_packages')) {
            Schema::create('vn_packages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('cn_batch_id')->nullable()->constrained('cn_batches')->nullOnDelete();
                $table->foreignId('cn_package_id')->nullable()->constrained('cn_packages')->nullOnDelete();
                $table->string('tracking_number_snapshot')->nullable();
                $table->decimal('actual_weight', 10, 2)->nullable();
                $table->decimal('actual_length', 10, 2)->nullable();
                $table->decimal('actual_width', 10, 2)->nullable();
                $table->decimal('actual_height', 10, 2)->nullable();
                $table->decimal('actual_volume', 10, 2)->nullable();
                $table->decimal('extra_fee', 10, 2)->default(0);
                $table->decimal('wooden_fee', 10, 2)->default(0);
                $table->decimal('other_fee', 10, 2)->default(0);
                $table->string('order_code_snapshot')->nullable();
                $table->string('customer_name_snapshot')->nullable();
                $table->enum('inspection_status', ['pending', 'inspected', 'damaged', 'missing', 'extra', 'mismatched'])->default('pending');
                $table->text('note')->nullable();
                $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('scanned_at')->nullable();
                $table->timestamp('received_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('vn_packages')) {
            Schema::drop('vn_packages');
        }

        if (Schema::hasTable('vn_warehouses')) {
            Schema::drop('vn_warehouses');
        }
    }
};
