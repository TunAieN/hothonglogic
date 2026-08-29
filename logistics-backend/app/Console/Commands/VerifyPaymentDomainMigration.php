<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class VerifyPaymentDomainMigration extends Command
{
    protected $signature = 'payment-domains:verify';

    protected $description = 'Kiểm tra tính đầy đủ của dữ liệu payment, delivery và shipment sau migration';

    public function handle(): int
    {
        $itemTotals = DB::table('payment_vouchers as pv')->leftJoin('payment_voucher_items as pvi', 'pvi.payment_voucher_id', '=', 'pv.id')
            ->groupBy('pv.id', 'pv.voucher_code', 'pv.subtotal')->selectRaw('pv.id, pv.voucher_code, pv.subtotal, COALESCE(SUM(pvi.amount), 0) as item_total');
        $mismatches = DB::query()->fromSub($itemTotals, 'totals')->whereRaw('ABS(subtotal - item_total) >= 1')->get();
        $checks = [
            'Phiếu không phải deposit thiếu delivery request' => DB::table('payment_vouchers as pv')
                ->where('pv.voucher_type', '!=', 'deposit')
                ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('delivery_requests as dr')->whereColumn('dr.payment_voucher_id', 'pv.id'))
                ->count(),
            'Delivery request dùng sai method deposit' => DB::table('delivery_requests')->where('delivery_method', 'deposit')->count(),
            'Giao tận nơi thiếu snapshot địa chỉ' => DB::table('delivery_requests as dr')
                ->where('dr.delivery_method', 'delivery')
                ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('delivery_addresses as da')->whereColumn('da.delivery_request_id', 'dr.id'))
                ->count(),
            'Phiếu thiếu voucher items' => DB::table('payment_vouchers as pv')
                ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('payment_voucher_items as pvi')->whereColumn('pvi.payment_voucher_id', 'pv.id'))
                ->count(),
            'Phiếu có subtotal lệch tổng item' => $mismatches->count(),
            'Delivery method ngoài tập chuẩn' => DB::table('delivery_requests')->whereNotIn('delivery_method', ['pickup_at_warehouse', 'delivery'])->count(),
        ];

        $legacyVoucherColumns = [
            'receiver_type', 'receiver_name', 'receiver_phone', 'delivery_province', 'delivery_district',
            'delivery_ward', 'delivery_address_line', 'delivery_address', 'delivery_note', 'shipping_carrier',
            'shipping_fee_total', 'domestic_shipping_fee', 'surcharge_total',
        ];
        $remainingLegacyColumns = array_values(array_filter($legacyVoucherColumns, fn ($column) => Schema::hasColumn('payment_vouchers', $column)));
        $remainingPackageDuplicates = array_values(array_filter(['domestic_shipping_fee', 'surcharge_amount'], fn ($column) => Schema::hasColumn('payment_voucher_packages', $column)));

        $this->table(['Kiểm tra', 'Số bản ghi lỗi'], collect($checks)->map(fn ($count, $label) => [$label, $count])->values()->all());
        $this->line('Snapshot địa chỉ chỉ có full_address, không có đủ địa giới: '.DB::table('delivery_addresses')->whereNotNull('full_address')->whereNull('province_name')->count());
        $this->line('Số cột payment_vouchers hiện tại: '.count(Schema::getColumnListing('payment_vouchers')));
        $this->line('Legacy columns còn lại: '.($remainingLegacyColumns === [] ? '0' : implode(', ', $remainingLegacyColumns)));
        $this->line('Package monetary duplicates còn lại: '.($remainingPackageDuplicates === [] ? '0' : implode(', ', $remainingPackageDuplicates)));
        $this->line('Bảng payment_voucher_surcharges còn tồn tại: '.(Schema::hasTable('payment_voucher_surcharges') ? 'có' : 'không'));
        if ($mismatches->isNotEmpty()) {
            $this->table(['ID', 'Mã phiếu', 'Subtotal', 'Tổng item'], $mismatches->map(fn ($row) => [$row->id, $row->voucher_code, $row->subtotal, $row->item_total])->all());
        }

        if (array_sum($checks) > 0) {
            $this->error('Phát hiện dữ liệu cần xử lý trước khi cleanup column cũ.');

            return self::FAILURE;
        }
        $this->info('Dữ liệu domain mới đã đầy đủ và cân bằng.');

        return self::SUCCESS;
    }
}
