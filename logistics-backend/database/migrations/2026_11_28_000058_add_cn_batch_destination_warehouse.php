<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vn_warehouses', function (Blueprint $table) {
            $table->enum('status', ['active', 'inactive'])->default('active');
        });

        Schema::table('cn_batches', function (Blueprint $table) {
            $table->foreignId('destination_warehouse_id')->nullable()->constrained('vn_warehouses')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('cn_batches', function (Blueprint $table) {
            $table->dropConstrainedForeignId('destination_warehouse_id');
        });

        Schema::table('vn_warehouses', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
