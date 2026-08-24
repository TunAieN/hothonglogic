<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_vouchers')) {
            return;
        }

        Schema::table('payment_vouchers', function (Blueprint $table) {
            if (! Schema::hasColumn('payment_vouchers', 'voucher_type')) {
                $table->string('voucher_type', 30)->default('shipping')->after('request_uuid');
            }
            if (! Schema::hasColumn('payment_vouchers', 'order_id')) {
                $table->foreignId('order_id')->nullable()->after('customer_id')->constrained('orders')->nullOnDelete();
            }
            if (! Schema::hasColumn('payment_vouchers', 'base_amount_cny')) {
                $table->decimal('base_amount_cny', 15, 2)->default(0)->after('bank_branch_name_snapshot');
            }
            if (! Schema::hasColumn('payment_vouchers', 'exchange_rate')) {
                $table->decimal('exchange_rate', 15, 4)->nullable()->after('base_amount_cny');
            }
            if (! Schema::hasColumn('payment_vouchers', 'base_amount_vnd')) {
                $table->decimal('base_amount_vnd', 18, 0)->default(0)->after('exchange_rate');
            }
            if (! Schema::hasColumn('payment_vouchers', 'deposit_percent')) {
                $table->decimal('deposit_percent', 5, 2)->nullable()->after('base_amount_vnd');
            }
            if (! Schema::hasColumn('payment_vouchers', 'currency')) {
                $table->string('currency', 3)->default('VND')->after('deposit_percent');
            }
            if (! Schema::hasColumn('payment_vouchers', 'expires_at')) {
                $table->timestamp('expires_at')->nullable()->after('cancelled_at');
            }
            $table->index(['voucher_type', 'order_id', 'status'], 'payment_vouchers_type_order_status_idx');
        });
    }

    public function down(): void
    {
        // Keep payment voucher snapshots; do not drop financial history automatically.
    }
};
