<?php

namespace App\GraphQL\Resolvers;

use App\Models\CnPackage;
use App\Models\CnPackageItem;
use App\Models\CnWarehouse;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderTracking;
use App\Models\OrderTrackingItem;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CnPackageResolver
{
    public function list(): Builder
    {
        return CnPackage::query()
            ->with(['warehouse', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem'])
            ->latest('received_at')
            ->latest('id');
    }

    public function show($_, array $args): CnPackage
    {
        return CnPackage::query()
            ->with(['warehouse', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem'])
            ->findOrFail($args['id']);
    }

    public function create($_, array $args): CnPackage
    {
        return DB::transaction(function () use ($args) {
            $input = $args['input'];
            $warehouse = $this->resolveWarehouse($input);
            $trackingNumber = $this->normalizeTrackingNumber($input['tracking_number'] ?? null);

            if ($trackingNumber === null) {
                throw new HttpException(422, 'Tracking number is required.');
            }

            $matchedTracking = $this->matchOrderTracking($trackingNumber);
            $weight = array_key_exists('weight', $input) ? $this->normalizeFloat($input['weight']) : null;
            $actualLength = array_key_exists('actual_length', $input) ? $this->normalizeFloat($input['actual_length']) : null;
            $actualWidth = array_key_exists('actual_width', $input) ? $this->normalizeFloat($input['actual_width']) : null;
            $actualHeight = array_key_exists('actual_height', $input) ? $this->normalizeFloat($input['actual_height']) : null;
            $volume = $this->calculateVolume($actualLength, $actualWidth, $actualHeight, $input['volume'] ?? null);
            $volumetricWeight = $this->calculateVolumetricWeight($actualLength, $actualWidth, $actualHeight, $input['volumetric_weight'] ?? null);
            $chargeableWeight = $this->calculateChargeableWeight($weight, $volumetricWeight, $input['chargeable_weight'] ?? null);

            $package = CnPackage::query()->create([
                'warehouse_id' => $warehouse->id,
                'order_id' => $matchedTracking?->order_id,
                'order_tracking_id' => $matchedTracking?->id,
                'receiver_name' => $this->normalizeOptionalString($input['receiver_name'] ?? null),
                'tracking_number' => $trackingNumber,
                'declared_value' => $matchedTracking?->declared_value ?? ($input['declared_value'] ?? null),
                'carrier' => $this->normalizeOptionalString($input['carrier'] ?? null) ?? 'VN Express',
                'weight' => $weight,
                'actual_length' => $actualLength,
                'actual_width' => $actualWidth,
                'actual_height' => $actualHeight,
                'volume' => $volume,
                'volumetric_weight' => $volumetricWeight,
                'chargeable_weight' => $chargeableWeight,
                'note' => $this->normalizeOptionalString($input['note'] ?? null),
                'status' => $matchedTracking ? 'matched' : 'unmatched',
                'package_condition' => $this->normalizeOptionalString($input['package_condition'] ?? null) ?? 'normal',
                'created_by' => Auth::id(),
                'received_at' => $input['received_at'] ?? null,
            ]);

            $this->refreshOrderTrackingStatus($matchedTracking);
            $this->syncOrderReceivingStatus($package);

            return $package->fresh(['warehouse', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem']);
        });
    }

    public function update($_, array $args): CnPackage
    {
        return DB::transaction(function () use ($args) {
            $package = CnPackage::query()->findOrFail($args['id']);

            if ($package->batchPackages()->exists()) {
                throw new HttpException(422, 'Package is already assigned to a batch.');
            }

            $input = $args['input'];
            $warehouse = null;

            if (! empty($input['warehouse_id']) || ! empty($input['warehouse_name']) || ! empty($input['warehouse_code'])) {
                $warehouse = $this->resolveWarehouse($input);
            }

            $trackingNumber = array_key_exists('tracking_number', $input)
                ? $this->normalizeTrackingNumber($input['tracking_number'])
                : $package->tracking_number;
            $matchedTracking = $this->matchOrderTracking($trackingNumber);
            $weight = array_key_exists('weight', $input) ? $this->normalizeFloat($input['weight']) : $package->weight;
            $actualLength = array_key_exists('actual_length', $input) ? $this->normalizeFloat($input['actual_length']) : $package->actual_length;
            $actualWidth = array_key_exists('actual_width', $input) ? $this->normalizeFloat($input['actual_width']) : $package->actual_width;
            $actualHeight = array_key_exists('actual_height', $input) ? $this->normalizeFloat($input['actual_height']) : $package->actual_height;
            $volume = $this->calculateVolume($actualLength, $actualWidth, $actualHeight, array_key_exists('volume', $input) ? $input['volume'] : $package->volume);
            $volumetricWeight = $this->calculateVolumetricWeight($actualLength, $actualWidth, $actualHeight, array_key_exists('volumetric_weight', $input) ? $input['volumetric_weight'] : $package->volumetric_weight);
            $chargeableWeight = $this->calculateChargeableWeight($weight, $volumetricWeight, array_key_exists('chargeable_weight', $input) ? $input['chargeable_weight'] : $package->chargeable_weight);

            $package->update([
                'warehouse_id' => $warehouse?->id ?? $package->warehouse_id,
                'order_id' => $matchedTracking?->order_id,
                'order_tracking_id' => $matchedTracking?->id,
                'receiver_name' => array_key_exists('receiver_name', $input)
                    ? $this->normalizeOptionalString($input['receiver_name'])
                    : $package->receiver_name,
                'tracking_number' => $trackingNumber,
                'declared_value' => array_key_exists('declared_value', $input)
                    ? $input['declared_value']
                    : ($matchedTracking?->declared_value ?? $package->declared_value),
                'carrier' => array_key_exists('carrier', $input)
                    ? ($this->normalizeOptionalString($input['carrier']) ?? 'VN Express')
                    : $package->carrier,
                'weight' => $weight,
                'actual_length' => $actualLength,
                'actual_width' => $actualWidth,
                'actual_height' => $actualHeight,
                'volume' => $volume,
                'volumetric_weight' => $volumetricWeight,
                'chargeable_weight' => $chargeableWeight,
                'note' => array_key_exists('note', $input)
                    ? $this->normalizeOptionalString($input['note'])
                    : $package->note,
                'status' => $matchedTracking ? 'matched' : ($input['status'] ?? 'unmatched'),
                'package_condition' => array_key_exists('package_condition', $input)
                    ? ($this->normalizeOptionalString($input['package_condition']) ?? 'normal')
                    : $package->package_condition,
                'received_at' => array_key_exists('received_at', $input) ? $input['received_at'] : $package->received_at,
            ]);

            $this->refreshOrderTrackingStatus($matchedTracking);
            $this->syncOrderReceivingStatus($package);

            return $package->fresh(['warehouse', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem']);
        });
    }

    public function confirmItems($_, array $args): CnPackage
    {
        return DB::transaction(function () use ($args) {
            $package = CnPackage::query()
                ->with(['order.items', 'orderTracking.packages.packageItems', 'packageItems'])
                ->findOrFail($args['package_id']);

            if ($package->batchPackages()->exists()) {
                throw new HttpException(422, 'Package is already assigned to a batch.');
            }

            if (! $package->order_id || ! $package->order_tracking_id || ! $package->order) {
                throw new HttpException(422, 'Package must be linked to an order tracking before confirming items.');
            }

            $orderItems = $package->order->items->keyBy(fn (OrderItem $item) => (string) $item->id);
            $selectedItems = collect($args['items'] ?? [])
                ->map(function (array $selection) use ($orderItems) {
                    $orderItemId = (string) ($selection['order_item_id'] ?? '');
                    $orderItem = $orderItems->get($orderItemId);

                    if (! $orderItem) {
                        throw new HttpException(422, 'Selected package item does not belong to this order.');
                    }

                    $quantity = max(0, (int) ($selection['quantity'] ?? 0));

                    if ($quantity <= 0) {
                        throw new HttpException(422, 'Package item quantity must be greater than 0.');
                    }

                    return [
                        'order_item' => $orderItem,
                        'quantity' => $quantity,
                    ];
                })
                ->values();

            if ($selectedItems->isEmpty()) {
                throw new HttpException(422, 'Please confirm at least one order item for this package.');
            }

            $package->packageItems()->delete();

            foreach ($selectedItems as $selection) {
                CnPackageItem::query()->create([
                    'cn_package_id' => $package->id,
                    'order_item_id' => $selection['order_item']->id,
                    'quantity' => $selection['quantity'],
                ]);
            }

            $tracking = $package->orderTracking()->with(['packages.packageItems.orderItem'])->first();

            if (! $tracking) {
                throw new HttpException(422, 'Tracking could not be resolved for this package.');
            }

            $this->syncTrackingItemsFromPackages($tracking);
            $this->refreshOrderTrackingStatus($tracking->fresh('packages'));

            $declaredValue = (float) $package->packageItems()
                ->with('orderItem')
                ->get()
                ->sum(fn (CnPackageItem $item) => (float) ($item->orderItem?->price_cny ?? 0) * (int) $item->quantity);

            $package->update([
                'declared_value' => $declaredValue,
                'status' => 'matched',
            ]);

            return $package->fresh(['warehouse', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem']);
        });
    }

    public function delete($_, array $args): CnPackage
    {
        return DB::transaction(function () use ($args) {
            $package = CnPackage::query()
                ->with(['warehouse', 'order.customer', 'orderTracking'])
                ->findOrFail($args['id']);

            if ($package->batchPackages()->exists()) {
                throw new HttpException(422, 'Package is already assigned to a batch.');
            }

            $deletedPackage = $package->replicate();
            $deletedPackage->setAttribute('id', $package->id);
            $deletedPackage->setRelation('warehouse', $package->warehouse);
            $deletedPackage->setRelation('order', $package->order);

            $package->delete();

            $this->refreshOrderTrackingStatus($package->orderTracking);

            return $deletedPackage;
        });
    }

    private function resolveWarehouse(array $input): CnWarehouse
    {
        if (! empty($input['warehouse_id'])) {
            return CnWarehouse::query()->findOrFail($input['warehouse_id']);
        }

        $warehouseCode = $this->normalizeOptionalString($input['warehouse_code'] ?? null);
        $warehouseName = $this->normalizeOptionalString($input['warehouse_name'] ?? null);

        if ($warehouseName === null) {
            throw new HttpException(422, 'Warehouse name is required.');
        }

        $resolvedCode = $warehouseCode ?? $this->inferWarehouseCode($warehouseName);

        return CnWarehouse::query()->firstOrCreate(
            ['code' => $resolvedCode],
            [
                'name' => $warehouseName,
                'address' => 'China warehouse',
                'status' => 'active',
            ],
        );
    }

    private function matchOrderTracking(?string $trackingNumber): ?OrderTracking
    {
        if ($trackingNumber === null) {
            return null;
        }

        return OrderTracking::query()
            ->with(['order', 'packages'])
            ->where('tracking_number', $trackingNumber)
            ->first();
    }

    private function normalizeTrackingNumber(mixed $value): ?string
    {
        $normalized = strtoupper(trim((string) ($value ?? '')));

        return $normalized !== '' ? $normalized : null;
    }

    private function refreshOrderTrackingStatus(?OrderTracking $tracking): void
    {
        if (! $tracking) {
            return;
        }

        $tracking->loadMissing('packages');
        $hasPackages = $tracking->packages->isNotEmpty();
        $hasReceivedPackages = $tracking->packages->contains(fn (CnPackage $package) => $package->received_at !== null);

        $tracking->update([
            'status' => $hasReceivedPackages ? 'received' : ($hasPackages ? 'matched' : 'pending'),
        ]);
    }

    private function syncTrackingItemsFromPackages(OrderTracking $tracking): void
    {
        $tracking->loadMissing('packages.packageItems.orderItem');
        $aggregated = [];

        foreach ($tracking->packages as $package) {
            foreach ($package->packageItems as $packageItem) {
                $orderItemId = (string) $packageItem->order_item_id;
                $aggregated[$orderItemId] = ($aggregated[$orderItemId] ?? 0) + (int) $packageItem->quantity;
            }
        }

        $tracking->trackingItems()->delete();

        foreach ($aggregated as $orderItemId => $quantity) {
            OrderTrackingItem::query()->create([
                'order_tracking_id' => $tracking->id,
                'order_item_id' => $orderItemId,
                'quantity' => $quantity,
            ]);
        }

        $declaredValue = (float) $tracking->trackingItems()
            ->with('orderItem')
            ->get()
            ->sum(fn (OrderTrackingItem $item) => (float) ($item->orderItem?->price_cny ?? 0) * (int) $item->quantity);

        $tracking->update([
            'declared_value' => $declaredValue,
        ]);
    }

    private function syncOrderReceivingStatus(CnPackage $package): void
    {
        if (! $package->order_id || ! $package->received_at) {
            return;
        }

        /** @var Order|null $order */
        $order = $package->relationLoaded('order')
            ? $package->order
            : Order::query()->find($package->order_id);

        if (! $order) {
            return;
        }

        if (strtolower((string) $order->status) !== 'waiting_cn_warehouse') {
            return;
        }

        $order->update([
            'status' => 'receiving',
        ]);
    }

    private function inferWarehouseCode(string $warehouseName): string
    {
        $normalized = mb_strtolower($warehouseName);

        return match (true) {
            str_contains($normalized, 'quảng châu a'),
            str_contains($normalized, 'quang chau a') => 'QCA',
            str_contains($normalized, 'thâm quyến b'),
            str_contains($normalized, 'tham quyen b') => 'SZB',
            str_contains($normalized, 'thâm quyến'),
            str_contains($normalized, 'tham quyen') => 'SZ',
            default => 'QC',
        };
    }

    private function normalizeOptionalString(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeFloat(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return round((float) $value, 2);
    }

    private function calculateVolume(?float $length, ?float $width, ?float $height, mixed $fallback = null): ?float
    {
        if ($length !== null && $width !== null && $height !== null) {
            return round(($length * $width * $height) / 1000000, 4);
        }

        return $this->normalizeFloat($fallback);
    }

    private function calculateVolumetricWeight(?float $length, ?float $width, ?float $height, mixed $fallback = null): ?float
    {
        if ($length !== null && $width !== null && $height !== null) {
            return round(($length * $width * $height) / 6000, 2);
        }

        return $this->normalizeFloat($fallback);
    }

    private function calculateChargeableWeight(?float $weight, ?float $volumetricWeight, mixed $fallback = null): ?float
    {
        if ($weight !== null || $volumetricWeight !== null) {
            return round(max($weight ?? 0, $volumetricWeight ?? 0), 2);
        }

        return $this->normalizeFloat($fallback);
    }
}
