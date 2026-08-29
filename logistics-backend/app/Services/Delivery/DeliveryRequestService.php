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
        if ($voucher->voucher_type === 'deposit') return null;

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

        if ($method === DeliveryRequest::METHOD_DELIVERY) $this->saveDeliveryAddressSnapshot($request, $input);

        return $request->load('address');
    }

    public function saveDeliveryAddressSnapshot(DeliveryRequest $request, array $input): DeliveryAddress
    {
        $source = ! empty($input['customer_address_id'])
            ? CustomerAddress::query()->where('customer_id', $request->customer_id)->find($input['customer_address_id'])
            : null;
        $values = [
            'receiver_name' => $input['receiver_name'] ?? $source?->receiver_name,
            'receiver_phone' => $input['receiver_phone'] ?? $source?->receiver_phone,
            'province_code' => $input['province_code'] ?? $source?->province_code,
            'province_name' => $input['province_name'] ?? $source?->province_name,
            'district_code' => $input['district_code'] ?? $source?->district_code,
            'district_name' => $input['district_name'] ?? $source?->district_name,
            'ward_code' => $input['ward_code'] ?? $source?->ward_code,
            'ward_name' => $input['ward_name'] ?? $source?->ward_name,
            'address_line' => $input['address_line'] ?? $source?->address_line,
            'full_address' => $input['full_address'] ?? $source?->full_address,
        ];
        foreach (['receiver_name', 'receiver_phone', 'province_name', 'district_name', 'ward_name', 'address_line'] as $field) {
            if (trim((string) ($values[$field] ?? '')) === '') throw new HttpException(422, 'Thông tin giao tận nơi chưa đầy đủ.');
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
