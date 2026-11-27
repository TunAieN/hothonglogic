<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('cn_packages', 'receiver_user_id')) {
                $table->foreignId('receiver_user_id')
                    ->nullable()
                    ->after('receiver_name')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('cn_packages', function (Blueprint $table) {
            if (Schema::hasColumn('cn_packages', 'receiver_user_id')) {
                $table->dropConstrainedForeignId('receiver_user_id');
            }
        });
    }
};
