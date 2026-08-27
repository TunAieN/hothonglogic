<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vn_packages', function (Blueprint $table) {
            $table->text('resolution_action')->nullable()->after('resolution_note');
            $table->text('resolution_result')->nullable()->after('resolution_action');
            $table->dateTime('expected_completion_at')->nullable()->after('resolution_result');
        });
    }

    public function down(): void
    {
        Schema::table('vn_packages', function (Blueprint $table) {
            $table->dropColumn(['resolution_action', 'resolution_result', 'expected_completion_at']);
        });
    }
};
