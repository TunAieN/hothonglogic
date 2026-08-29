<?php

namespace App\Services\Shipping\Contracts;

interface ShippingCarrierInterface
{
    public function carrierCode(): string;

    public function quote(array $request): array;

    public function createShipment(array $request): array;

    public function cancelShipment(string $carrierOrderId): array;

    public function getTracking(string $trackingNumber): array;

    public function getLabel(string $carrierOrderId): array;
}
