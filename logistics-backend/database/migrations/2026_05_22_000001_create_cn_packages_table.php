<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cn_packages')) {
            Schema::create('cn_packages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('warehouse_id')->constrained('cn_warehouses')->restrictOnDelete();
                $table->foreignId('order_id')->constrained('orders')->restrictOnDelete();
                $table->string('tracking_number', 100)->unique();
                $table->decimal('weight', 8, 2)->nullable();
                $table->decimal('volume', 10, 2)->nullable();
                $table->text('note')->nullable();
                $table->string('status', 20)->default('matched');
                $table->unsignedBigInteger('batch_id')->nullable();
                $table->timestamp('received_at')->nullable();
                $table->timestamps();
            });
        } else {
            Schema::table('cn_packages', function (Blueprint $table) {
                if (! Schema::hasColumn('cn_packages', 'order_id')) {
                    $table->foreignId('order_id')->nullable()->after('warehouse_id')->constrained('orders')->restrictOnDelete();
                }

                if (! Schema::hasColumn('cn_packages', 'received_at')) {
                    $table->timestamp('received_at')->nullable()->after('status');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('cn_packages')) {
            Schema::dropIfExists('cn_packages');
        }
    }
};
