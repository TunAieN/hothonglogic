<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cn_package_items')) {
            Schema::create('cn_package_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('cn_package_id')->constrained('cn_packages')->cascadeOnDelete();
                $table->foreignId('order_item_id')->constrained('order_items')->restrictOnDelete();
                $table->unsignedInteger('quantity')->default(1);
                $table->timestamps();
                $table->unique(['cn_package_id', 'order_item_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cn_package_items');
    }
};
