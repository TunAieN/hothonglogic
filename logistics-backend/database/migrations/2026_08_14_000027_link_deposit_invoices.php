<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('invoices')) {
            return;
        }

        Schema::table('invoices', function (Blueprint $table) {
            if (! Schema::hasColumn('invoices', 'invoice_type')) {
                $table->string('invoice_type', 30)->default('shipping')->after('payment_voucher_id');
            }
            if (! Schema::hasColumn('invoices', 'order_id')) {
                $table->foreignId('order_id')->nullable()->after('invoice_type')->constrained('orders')->nullOnDelete();
            }
            if (! Schema::hasColumn('invoices', 'payment_transaction_id')) {
                $table->foreignId('payment_transaction_id')
                    ->nullable()
                    ->unique()
                    ->after('order_id')
                    ->constrained('payment_transactions')
                    ->nullOnDelete();
            }
        });

        DB::table('invoices')
            ->join('payment_vouchers', 'payment_vouchers.id', '=', 'invoices.payment_voucher_id')
            ->where('payment_vouchers.voucher_type', 'deposit')
            ->update([
                'invoices.invoice_type' => 'deposit',
                'invoices.order_id' => DB::raw('payment_vouchers.order_id'),
            ]);
    }

    public function down(): void
    {
        // Keep financial links and invoice classification on rollback to avoid losing audit data.
    }
};
