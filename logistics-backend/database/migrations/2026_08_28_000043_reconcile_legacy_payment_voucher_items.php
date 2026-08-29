<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_voucher_items')) return;

        DB::table('payment_vouchers')->orderBy('id')->chunkById(100, function ($vouchers) {
            foreach ($vouchers as $voucher) {
                $itemTotal = (float) DB::table('payment_voucher_items')->where('payment_voucher_id', $voucher->id)->sum('amount');
                $difference = round((float) $voucher->subtotal - $itemTotal, 2);
                if (abs($difference) < 0.01) continue;
                if (DB::table('payment_voucher_items')->where('payment_voucher_id', $voucher->id)->where('item_type', 'legacy_reconciliation')->exists()) continue;

                DB::table('payment_voucher_items')->insert([
                    'payment_voucher_id' => $voucher->id,
                    'item_type' => 'legacy_reconciliation',
                    'description' => 'Đối soát sai số làm tròn dữ liệu cũ',
                    'quantity' => 1,
                    'unit_price' => $difference,
                    'amount' => $difference,
                    'reference_type' => 'PaymentVoucher',
                    'reference_id' => $voucher->id,
                    'metadata' => json_encode(['reason' => 'legacy_rounding_difference', 'item_total_before' => $itemTotal], JSON_UNESCAPED_UNICODE),
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });
    }

    public function down(): void
    {
        // Reconciliation rows preserve historical financial totals and are intentionally retained.
    }
};
