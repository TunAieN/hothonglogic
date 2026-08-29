<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const VOUCHER_COLUMNS = [
        'receiver_type', 'receiver_name', 'receiver_phone',
        'delivery_province', 'delivery_district', 'delivery_ward',
        'delivery_address_line', 'delivery_address', 'delivery_note',
        'shipping_carrier', 'shipping_fee_total', 'domestic_shipping_fee',
        'surcharge_total',
    ];

    private const PACKAGE_COLUMNS = ['domestic_shipping_fee', 'surcharge_amount'];

    public function up(): void
    {
        $this->normalizeDeliveryMethods();
        $this->assertReadyForCleanup();

        if (Schema::hasTable('payment_voucher_surcharges')) {
            Schema::drop('payment_voucher_surcharges');
        }

        $voucherColumns = array_values(array_filter(
            self::VOUCHER_COLUMNS,
            fn (string $column) => Schema::hasColumn('payment_vouchers', $column),
        ));
        if ($voucherColumns !== []) {
            Schema::table('payment_vouchers', fn (Blueprint $table) => $table->dropColumn($voucherColumns));
        }

        $packageColumns = array_values(array_filter(
            self::PACKAGE_COLUMNS,
            fn (string $column) => Schema::hasColumn('payment_voucher_packages', $column),
        ));
        if ($packageColumns !== []) {
            Schema::table('payment_voucher_packages', fn (Blueprint $table) => $table->dropColumn($packageColumns));
        }
    }

    private function normalizeDeliveryMethods(): void
    {
        DB::table('delivery_requests')->where('delivery_method', 'pickup')->update(['delivery_method' => 'pickup_at_warehouse']);
        DB::table('delivery_requests')->where('delivery_method', 'local_delivery')->update(['delivery_method' => 'delivery']);
    }

    private function assertReadyForCleanup(): void
    {
        $checks = [
            'non-deposit vouchers without delivery request' => DB::table('payment_vouchers as pv')
                ->where('pv.voucher_type', '!=', 'deposit')
                ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('delivery_requests as dr')->whereColumn('dr.payment_voucher_id', 'pv.id'))
                ->count(),
            'invalid delivery methods' => DB::table('delivery_requests')->whereNotIn('delivery_method', ['pickup_at_warehouse', 'delivery'])->count(),
            'delivery requests without address snapshot' => DB::table('delivery_requests as dr')
                ->where('dr.delivery_method', 'delivery')
                ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('delivery_addresses as da')->whereColumn('da.delivery_request_id', 'dr.id'))
                ->count(),
            'vouchers without monetary items' => DB::table('payment_vouchers as pv')
                ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('payment_voucher_items as pvi')->whereColumn('pvi.payment_voucher_id', 'pv.id'))
                ->count(),
            'voucher subtotal/item mismatches' => DB::query()->fromSub(
                DB::table('payment_vouchers as pv')->leftJoin('payment_voucher_items as pvi', 'pvi.payment_voucher_id', '=', 'pv.id')
                    ->groupBy('pv.id', 'pv.subtotal')->selectRaw('pv.id, pv.subtotal, COALESCE(SUM(pvi.amount), 0) item_total'),
                'totals',
            )->whereRaw('ABS(subtotal - item_total) >= 1')->count(),
            'delivery legacy rows without a complete snapshot' => DB::table('payment_vouchers as pv')
                ->join('delivery_requests as dr', 'dr.payment_voucher_id', '=', 'pv.id')
                ->leftJoin('delivery_addresses as da', 'da.delivery_request_id', '=', 'dr.id')
                ->where('pv.receiver_type', 'local_delivery')
                ->where(fn ($query) => $query->whereNull('da.id')->orWhereNull('da.receiver_name')->orWhereNull('da.receiver_phone')->orWhereNull('da.full_address'))
                ->count(),
            'legacy carriers without shipment' => DB::table('payment_vouchers as pv')
                ->join('delivery_requests as dr', 'dr.payment_voucher_id', '=', 'pv.id')
                ->whereNotNull('pv.shipping_carrier')->where('pv.shipping_carrier', '!=', '')
                ->whereNotExists(function ($query) {
                    $query->selectRaw('1')->from('shipments as s')->whereColumn('s.delivery_request_id', 'dr.id')
                        ->whereRaw('UPPER(s.carrier_code) = UPPER(pv.shipping_carrier)');
                })->count(),
            'legacy surcharge rows without item' => Schema::hasTable('payment_voucher_surcharges')
                ? DB::table('payment_voucher_surcharges as pvs')->whereNotExists(function ($query) {
                    $query->selectRaw('1')->from('payment_voucher_items as pvi')
                        ->where('pvi.reference_type', 'PaymentVoucherSurcharge')->whereColumn('pvi.reference_id', 'pvs.id');
                })->count()
                : 0,
        ];

        $failed = array_filter($checks, fn (int $count) => $count > 0);
        if ($failed !== []) {
            throw new \RuntimeException('Payment domain cleanup aborted: '.json_encode($failed, JSON_UNESCAPED_UNICODE));
        }
    }

    public function down(): void
    {
        // Irreversible by design: restoring duplicate legacy sources would recreate ambiguity
        // and could not restore their original values faithfully.
    }
};
