<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_packages', 'receiver_name')) {
                $table->string('receiver_name', 255)->nullable()->after('order_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (Schema::hasColumn('cn_packages', 'receiver_name')) {
                $table->dropColumn('receiver_name');
            }
        });
    }
};
