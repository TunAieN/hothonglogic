<?php

namespace App\Services\Delivery;

use App\Models\CustomerAddress;
use App\Models\DeliveryAddress;
use App\Models\DeliveryRequest;
use App\Models\PaymentVoucher;
use App\Models\ShippingTask;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpKernel\Exception\HttpException;

class DeliveryRequestService
{
    public function createForVoucher(PaymentVoucher $voucher, array $input): ?DeliveryRequest
    {
        if ($voucher->voucher_type === 'deposit') {
            return null;
        }

        $method = $this->normalizeMethod($input['delivery_method'] ?? null);
        $request = DeliveryRequest::query()->create([
            'customer_id' => $voucher->customer_id,
            'payment_voucher_id' => $voucher->id,
            'order_id' => $voucher->order_id,
            'delivery_method' => $method,
            'preferred_carrier' => $method === DeliveryRequest::METHOD_DELIVERY
                ? strtoupper(trim((string) ($input['preferred_carrier'] ?? '')) ?: null)
                : null,
            'delivery_note' => $method === DeliveryRequest::METHOD_DELIVERY ? ($input['delivery_note'] ?? null) : null,
            'status' => DeliveryRequest::STATUS_AWAITING_PAYMENT,
            'created_by' => Auth::id() ?? $voucher->created_by,
        ]);

        if ($method === DeliveryRequest::METHOD_DELIVERY) {
            $this->saveDeliveryAddressSnapshot($request, $input);
        }

        return $request->load('address');
    }

    public function saveDeliveryAddressSnapshot(DeliveryRequest $request, array $input): DeliveryAddress
    {
        $source = null;
        if (! empty($input['customer_address_id'])) {
            $source = CustomerAddress::query()
                ->where('customer_id', $request->customer_id)
                ->find($input['customer_address_id']);
            if (! $source) {
                throw new HttpException(422, 'Địa chỉ không thuộc khách hàng đã chọn.');
            }
        }
        $values = [
            'receiver_name' => $source?->receiver_name ?? $input['receiver_name'] ?? null,
            'receiver_phone' => $source?->receiver_phone ?? $input['receiver_phone'] ?? null,
            'province_code' => $source?->province_code ?? $input['province_code'] ?? null,
            'province_name' => $source?->province_name ?? $input['province_name'] ?? null,
            'district_code' => $source?->district_code ?? $input['district_code'] ?? null,
            'district_name' => $source?->district_name ?? $input['district_name'] ?? null,
            'ward_code' => $source?->ward_code ?? $input['ward_code'] ?? null,
            'ward_name' => $source?->ward_name ?? $input['ward_name'] ?? null,
            'address_line' => $source?->address_line ?? $input['address_line'] ?? null,
            'full_address' => $source?->full_address ?? $input['full_address'] ?? null,
        ];
        foreach (['receiver_name', 'receiver_phone', 'province_code', 'province_name', 'district_code', 'district_name', 'ward_code', 'ward_name', 'address_line'] as $field) {
            if (trim((string) ($values[$field] ?? '')) === '') {
                throw new HttpException(422, 'Thông tin giao tận nơi chưa đầy đủ.');
            }
        }
        if (trim((string) ($values['full_address'] ?? '')) === '') {
            $values['full_address'] = implode(', ', array_filter([$values['address_line'], $values['ward_name'], $values['district_name'], $values['province_name']]));
        }

        return DeliveryAddress::query()->create([
            'delivery_request_id' => $request->id,
            'source_customer_address_id' => $source?->id,
            ...array_map(fn ($value) => is_string($value) ? trim($value) : $value, $values),
        ]);
    }

    public function markVoucherPaid(PaymentVoucher $voucher): void
    {
        $voucher->deliveryRequest()->update(['status' => DeliveryRequest::STATUS_READY_TO_SHIP]);
    }

    public function cancelForVoucher(PaymentVoucher $voucher): void
    {
        $voucher->deliveryRequest()->update(['status' => DeliveryRequest::STATUS_CANCELLED]);
    }

    public function attachShippingTask(ShippingTask $task, array $voucherIds): int
    {
        return DeliveryRequest::query()
            ->whereIn('payment_voucher_id', array_values(array_unique(array_map('intval', $voucherIds))))
            ->where('status', DeliveryRequest::STATUS_READY_TO_SHIP)
            ->update(['shipping_task_id' => $task->id, 'status' => DeliveryRequest::STATUS_PROCESSING]);
    }

    private function normalizeMethod(?string $method): string
    {
        return match ($method) {
            'delivery' => DeliveryRequest::METHOD_DELIVERY,
            'pickup_at_warehouse', null, '' => DeliveryRequest::METHOD_PICKUP,
            default => throw new HttpException(422, 'Hình thức nhận hàng không hợp lệ.'),
        };
    }
}
