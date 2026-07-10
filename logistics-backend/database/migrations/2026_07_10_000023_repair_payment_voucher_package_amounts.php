<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('payment_voucher_packages')) {
            Schema::table('payment_voucher_packages', function (Blueprint $table) {
                $table->decimal('actual_weight', 10, 3)->default(0)->change();
                $table->decimal('volumetric_weight', 10, 3)->default(0)->change();
                $table->decimal('chargeable_weight', 10, 3)->default(0)->change();
                $table->decimal('shipping_fee', 15, 2)->default(0)->change();
                $table->decimal('domestic_shipping_fee', 15, 2)->default(0)->change();
                $table->decimal('surcharge_amount', 15, 2)->default(0)->change();
                $table->decimal('total_amount', 15, 2)->default(0)->change();
            });

            DB::table('payment_voucher_packages')
                ->orderBy('id')
                ->chunkById(100, function ($rows) {
                    foreach ($rows as $row) {
                        $priceType = in_array($row->price_type ?? null, ['fixed', 'per_kg'], true) ? $row->price_type : 'per_kg';
                        $unitPrice = (float) ($row->unit_price ?? 0) > 0 ? (float) $row->unit_price : (float) ($row->price_per_kg ?? 0);
                        $chargeableWeight = (float) ($row->chargeable_weight ?? 0);
                        $shippingFee = $priceType === 'fixed' ? $unitPrice : $chargeableWeight * $unitPrice;
                        $domesticFee = (float) ($row->domestic_shipping_fee ?? 0);
                        $surcharge = (float) ($row->surcharge_amount ?? 0);

                        DB::table('payment_voucher_packages')->where('id', $row->id)->update([
                            'unit_price' => round($unitPrice, 0),
                            'price_per_kg' => round($unitPrice, 0),
                            'price_type' => $priceType,
                            'shipping_fee' => round($shippingFee, 0),
                            'domestic_shipping_fee' => round($domesticFee, 0),
                            'surcharge_amount' => round($surcharge, 0),
                            'total_amount' => round($shippingFee + $domesticFee + $surcharge, 0),
                            'created_at' => $row->created_at ?: now(),
                            'updated_at' => now(),
                        ]);
                    }
                });
        }
    }

    public function down(): void
    {
        // Keep repaired monetary data and precision changes.
    }
};
