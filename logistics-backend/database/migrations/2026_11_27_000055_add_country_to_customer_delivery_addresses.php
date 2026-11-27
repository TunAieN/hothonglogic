<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_addresses', function (Blueprint $table) {
            $table->string('country_code', 2)->nullable()->after('receiver_phone');
            $table->string('country_name', 100)->nullable()->after('country_code');
        });

        Schema::table('delivery_addresses', function (Blueprint $table) {
            $table->string('country_code', 2)->nullable()->after('receiver_phone');
            $table->string('country_name', 100)->nullable()->after('country_code');
        });
    }

    public function down(): void
    {
        Schema::table('delivery_addresses', function (Blueprint $table) {
            $table->dropColumn(['country_code', 'country_name']);
        });

        Schema::table('customer_addresses', function (Blueprint $table) {
            $table->dropColumn(['country_code', 'country_name']);
        });
    }
};
