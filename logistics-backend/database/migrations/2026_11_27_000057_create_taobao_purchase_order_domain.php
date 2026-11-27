<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('taobao_purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('platform', 32)->default('taobao');
            $table->string('external_order_code', 191);
            $table->string('shop_id', 191)->nullable();
            $table->string('shop_name', 255)->nullable();
            $table->dateTime('purchased_at')->nullable();
            $table->text('note')->nullable();
            $table->text('shop_exception_reason')->nullable();
            $table->string('status', 32)->default('recorded');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('confirmed_at')->nullable();
            $table->timestamps();

            $table->unique(['order_id', 'external_order_code'], 'taobao_purchase_order_code_unique');
            $table->index('external_order_code', 'taobao_purchase_external_code_index');
            $table->index(['order_id', 'status'], 'taobao_purchase_order_status_index');
        });

        Schema::create('taobao_purchase_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('taobao_purchase_order_id')->constrained('taobao_purchase_orders')->cascadeOnDelete();
            $table->foreignId('order_item_id')->constrained('order_items')->restrictOnDelete();
            $table->unsignedInteger('quantity');
            $table->timestamps();

            $table->unique(['taobao_purchase_order_id', 'order_item_id'], 'taobao_purchase_item_unique');
            $table->index('order_item_id', 'taobao_purchase_order_item_index');
        });

        Schema::create('taobao_purchase_order_trackings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('taobao_purchase_order_id')->constrained('taobao_purchase_orders')->cascadeOnDelete();
            $table->foreignId('order_tracking_id')->constrained('order_trackings')->cascadeOnDelete();
            $table->foreignId('linked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['taobao_purchase_order_id', 'order_tracking_id'], 'taobao_purchase_tracking_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('taobao_purchase_order_trackings');
        Schema::dropIfExists('taobao_purchase_order_items');
        Schema::dropIfExists('taobao_purchase_orders');
    }
};
