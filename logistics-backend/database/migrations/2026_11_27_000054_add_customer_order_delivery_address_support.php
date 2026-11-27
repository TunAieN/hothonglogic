<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_addresses', function (Blueprint $table) {
            $table->string('delivery_note', 500)->nullable()->after('full_address');
        });

        DB::statement('ALTER TABLE customer_addresses ADD COLUMN default_customer_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_default = 1, customer_id, NULL)) STORED, ADD UNIQUE INDEX customer_addresses_one_default_unique (default_customer_id)');
    }

    public function down(): void
    {
        Schema::table('customer_addresses', function (Blueprint $table) {
            $table->dropUnique('customer_addresses_one_default_unique');
            $table->dropColumn(['default_customer_id', 'delivery_note']);
        });
    }
};
