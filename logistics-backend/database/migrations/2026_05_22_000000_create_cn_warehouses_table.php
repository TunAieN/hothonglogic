<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cn_warehouses')) {
            Schema::create('cn_warehouses', function (Blueprint $table) {
                $table->id();
                $table->string('code', 20)->unique();
                $table->string('name', 100);
                $table->text('address')->nullable();
                $table->timestamps();
            });
        }

        DB::table('cn_warehouses')->updateOrInsert(
            ['code' => 'QC'],
            [
                'name' => 'Kho Quang Chau',
                'address' => 'Guangzhou, China',
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        if (Schema::hasTable('cn_warehouses')) {
            Schema::dropIfExists('cn_warehouses');
        }
    }
};
