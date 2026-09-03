<?php

namespace App\Services\Shipping;

use App\Models\DeliveryRequest;
use App\Models\PaymentVoucher;
use App\Models\VnPackage;
use App\Models\VnWarehouse;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ShippingTaskGhnPreviewService
{
    public function __construct(
        private readonly GhnService $ghn,
        private readonly GhnInsuranceValueService $insuranceValueService,
    ) {}

    public function preview(array $input): array
    {
        $orderIds = array_values(array_unique(array_filter(array_map('intval', $input['order_ids'] ?? []))));
        if ($orderIds === []) {
            throw new HttpException(422, 'Vui lòng chọn ít nhất một đơn hàng.');
        }

        $packages = $this->eligiblePackages($orderIds);
        $coveredOrderIds = $packages->map(fn (VnPackage $package) => (int) $package->cnPackage?->order_id)->unique()->values()->all();
        if (count($coveredOrderIds) !== count($orderIds)) {
            throw new HttpException(422, 'Một hoặc nhiều đơn hàng không còn đủ điều kiện xuất hàng.');
        }

        $warehouse = $this->resolveWarehouse($packages);
        [$request, $address] = $this->resolveDeliveryAddress($packages);
        $vouchers = $packages->pluck('paymentVoucher')->filter()->unique('id')->values();
        $collectedFee = (float) $vouchers
            ->flatMap->items
            ->where('item_type', 'domestic_shipping')
            ->sum('amount');
        $settledValue = (float) $vouchers
            ->filter(fn (PaymentVoucher $voucher) => $voucher->status === PaymentVoucher::STATUS_PAID && (float) $voucher->remaining_amount <= 0)
            ->sum('subtotal');
        $insuranceValue = $this->insuranceValueService->forPackages($packages);

        $ghn = $this->ghn->preview([
            'to_district_id' => (int) $address->district_code,
            'to_ward_code' => (string) $address->ward_code,
            'service_id' => isset($input['service_id']) ? (int) $input['service_id'] : null,
            'insurance_value' => $insuranceValue,
        ], $packages);
        $difference = round((float) $ghn['current_fee'] - $collectedFee, 0);

        return [
            'mode' => $ghn['mode'],
            'validation_status' => 'valid',
            'carrier_code' => 'ghn',
            'carrier_name' => 'Giao Hàng Nhanh (GHN)',
            'services' => $ghn['services'],
            'service_id' => $ghn['service']['service_id'],
            'service_type_id' => $ghn['service']['service_type_id'],
            'service_name' => $ghn['service']['service_name'],
            'warehouse' => [
                'id' => (string) $warehouse->id,
                'name' => $warehouse->name,
                'address' => $warehouse->address,
            ],
            'delivery_request_id' => (string) $request->id,
            'address' => [
                'receiver_name' => $address->receiver_name,
                'receiver_phone' => $address->receiver_phone,
                'province_code' => $address->province_code,
                'province_name' => $address->province_name,
                'district_code' => $address->district_code,
                'district_name' => $address->district_name,
                'ward_code' => $address->ward_code,
                'ward_name' => $address->ward_name,
                'address_line' => $address->address_line,
                'full_address' => $address->full_address,
            ],
            'package_count' => $packages->count(),
            'total_weight' => round((float) $packages->sum('actual_weight'), 3),
            'length' => (float) $ghn['dimensions']['length'],
            'width' => (float) $ghn['dimensions']['width'],
            'height' => (float) $ghn['dimensions']['height'],
            'settled_value' => $settledValue,
            'collected_fee' => $collectedFee,
            'current_fee' => (float) $ghn['current_fee'],
            'fee_difference' => $difference,
            'fee_status' => $difference > 0 ? 'increased' : ($difference < 0 ? 'decreased' : 'matched'),
            'cod_amount' => 0.0,
            'estimated_delivery_at' => Carbon::parse($ghn['estimated_delivery_at']),
        ];
    }

    private function eligiblePackages(array $orderIds): Collection
    {
        return VnPackage::query()
            ->with([
                'cnPackage.order',
                'receipt.warehouse',
                'cnBatch.vnBatchReceipt.warehouse',
                'paymentVoucher.warehouse',
                'paymentVoucher.items',
                'paymentVoucher.deliveryRequest.address',
            ])
            ->whereHas('cnPackage', fn (Builder $query) => $query->whereIn('order_id', $orderIds))
            ->where('payment_status', 'paid')
            ->where('delivery_status', 'ready_for_delivery')
            ->whereDoesntHave('exportItem')
            ->whereHas('paymentVoucher', fn (Builder $query) => $query
                ->where('status', PaymentVoucher::STATUS_PAID)
                ->where('remaining_amount', '<=', 0))
            ->get();
    }

    public function resolveWarehouse(Collection $packages): object
    {
        $warehouses = $packages
            ->map(fn (VnPackage $package) => $package->receipt?->warehouse
                ?? $package->cnBatch?->vnBatchReceipt?->warehouse
                ?? $package->paymentVoucher?->warehouse)
            ->filter()
            ->unique('id')
            ->values();
        if ($warehouses->isEmpty()) {
            // Legacy receipts/vouchers may predate vn_warehouse_id. A single configured
            // VN warehouse is unambiguous; never guess when multiple warehouses exist.
            $onlyWarehouse = VnWarehouse::query()->orderBy('id')->limit(2)->get();
            if ($onlyWarehouse->count() === 1) {
                return $onlyWarehouse->first();
            }
            throw new HttpException(422, 'Không xác định được kho xuất hàng thực tế của kiện hàng.');
        }
        if ($warehouses->count() > 1) {
            throw new HttpException(422, 'Các kiện thuộc nhiều kho Việt Nam khác nhau. Vui lòng tạo nhiệm vụ riêng cho từng kho.');
        }

        return $warehouses->first();
    }

    private function resolveDeliveryAddress(Collection $packages): array
    {
        $requests = $packages
            ->map(fn (VnPackage $package) => $package->paymentVoucher?->deliveryRequest)
            ->filter()
            ->unique('id')
            ->values();
        if ($requests->isEmpty() || $requests->count() !== $packages->pluck('payment_voucher_id')->filter()->unique()->count()) {
            throw new HttpException(422, 'Không tìm thấy yêu cầu giao hàng đã xác nhận của phiếu thanh toán.');
        }
        if ($requests->contains(fn (DeliveryRequest $request) => $request->status !== DeliveryRequest::STATUS_READY_TO_SHIP
            || $request->delivery_method !== DeliveryRequest::METHOD_DELIVERY || ! $request->address)) {
            throw new HttpException(422, 'Đơn hàng không có snapshot địa chỉ giao tận nơi hợp lệ.');
        }

        $fingerprints = $requests->map(fn (DeliveryRequest $request) => implode('|', [
            $request->address->receiver_name,
            $request->address->receiver_phone,
            $request->address->district_code,
            $request->address->ward_code,
            $request->address->address_line,
        ]))->unique();
        if ($fingerprints->count() > 1) {
            throw new HttpException(422, 'Các đơn hàng có địa chỉ giao khác nhau. Vui lòng tạo nhiệm vụ riêng cho từng địa chỉ.');
        }

        $request = $requests->first();
        $address = $request->address;
        if (collect(['receiver_name', 'receiver_phone', 'district_code', 'ward_code', 'address_line'])
            ->contains(fn (string $field) => trim((string) $address->{$field}) === '')
            || (int) $address->district_code <= 0) {
            throw new HttpException(422, 'Địa chỉ giao hàng chưa có mã GHN hợp lệ.');
        }

        return [$request, $address];
    }
}
