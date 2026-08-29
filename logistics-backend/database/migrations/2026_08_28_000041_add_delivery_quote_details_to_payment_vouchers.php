<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_vouchers', function (Blueprint $table) {
            if (! Schema::hasColumn('payment_vouchers', 'receiver_name')) $table->string('receiver_name', 150)->nullable()->after('receiver_type');
            if (! Schema::hasColumn('payment_vouchers', 'receiver_phone')) $table->string('receiver_phone', 30)->nullable()->after('receiver_name');
            if (! Schema::hasColumn('payment_vouchers', 'delivery_province')) $table->string('delivery_province', 100)->nullable()->after('receiver_phone');
            if (! Schema::hasColumn('payment_vouchers', 'delivery_district')) $table->string('delivery_district', 100)->nullable()->after('delivery_province');
            if (! Schema::hasColumn('payment_vouchers', 'delivery_ward')) $table->string('delivery_ward', 100)->nullable()->after('delivery_district');
            if (! Schema::hasColumn('payment_vouchers', 'delivery_address_line')) $table->string('delivery_address_line', 255)->nullable()->after('delivery_ward');
            if (! Schema::hasColumn('payment_vouchers', 'shipping_carrier')) $table->string('shipping_carrier', 50)->nullable()->after('delivery_address');
            if (! Schema::hasColumn('payment_vouchers', 'delivery_note')) $table->text('delivery_note')->nullable()->after('shipping_carrier');
        });
    }

    public function down(): void
    {
        // Compatibility columns contain business data and are intentionally retained.
    }
};
