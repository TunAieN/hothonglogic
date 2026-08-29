<?php

namespace App\Services\Shipping;

use App\Models\DeliveryRequest;
use App\Models\Shipment;
use App\Models\ShipmentTrackingEvent;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ShipmentService
{
    public function createPending(DeliveryRequest $request, array $input): Shipment
    {
        if (! $request->shipping_task_id || ! in_array($request->status, [DeliveryRequest::STATUS_PROCESSING, DeliveryRequest::STATUS_READY_TO_SHIP], true)) {
            throw new HttpException(422, 'Yêu cầu giao hàng chưa gắn với nhiệm vụ xuất hợp lệ.');
        }
        $carrier = strtoupper(trim((string) ($input['carrier_code'] ?? $request->preferred_carrier ?? '')));
        if ($carrier === '') throw new HttpException(422, 'Vui lòng chọn hãng vận chuyển.');

        return DB::transaction(function () use ($request, $input, $carrier) {
            $shipment = Shipment::query()->create([
                'delivery_request_id' => $request->id,
                'carrier_code' => $carrier,
                'service_code' => $input['service_code'] ?? null,
                'shipping_fee' => max(0, (float) ($input['shipping_fee'] ?? 0)),
                'cod_amount' => max(0, (float) ($input['cod_amount'] ?? 0)),
                'weight' => $input['weight'] ?? null,
                'length' => $input['length'] ?? null,
                'width' => $input['width'] ?? null,
                'height' => $input['height'] ?? null,
                'status' => Shipment::STATUS_PENDING,
                'raw_response' => $input['raw_response'] ?? null,
            ]);
            ShipmentTrackingEvent::query()->create([
                'shipment_id' => $shipment->id,
                'internal_status' => Shipment::STATUS_PENDING,
                'description' => 'Đã khởi tạo shipment nội bộ; chưa gọi API hãng vận chuyển.',
                'occurred_at' => now(),
            ]);
            return $shipment->load('trackingEvents');
        });
    }
}
