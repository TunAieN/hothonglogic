<?php

namespace App\GraphQL\Resolvers;

use App\Models\CnPackage;
use App\Models\OrderTracking;
use App\Models\CnWarehouse;
use App\Models\Order;
use Illuminate\Support\Facades\Auth;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CnPackageResolver
{
    public function list(): Builder
    {
        return CnPackage::query()
            ->with(['warehouse', 'order.customer', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse'])
            ->latest('received_at')
            ->latest('id');
    }

    public function show($_, array $args): CnPackage
    {
        return CnPackage::query()
            ->with(['warehouse', 'order.customer', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse'])
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

            $package = CnPackage::query()->create([
                'warehouse_id' => $warehouse->id,
                'order_id' => $matchedTracking?->order_id,
                'order_tracking_id' => $matchedTracking?->id,
                'receiver_name' => $this->normalizeOptionalString($input['receiver_name'] ?? null),
                'tracking_number' => $trackingNumber,
                'declared_value' => $matchedTracking?->declared_value ?? ($input['declared_value'] ?? null),
                'carrier' => $this->normalizeOptionalString($input['carrier'] ?? null) ?? 'VN Express',
                'weight' => $input['weight'] ?? null,
                'volume' => $input['volume'] ?? null,
                'note' => $this->normalizeOptionalString($input['note'] ?? null),
                'status' => $matchedTracking ? 'matched' : 'unmatched',
                'created_by' => Auth::id(),
                'received_at' => $input['received_at'] ?? null,
            ]);

            $this->refreshOrderTrackingStatus($matchedTracking);
            $this->syncOrderReceivingStatus($package);

            return $package->fresh(['warehouse', 'order.customer', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse']);
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
                'weight' => array_key_exists('weight', $input) ? $input['weight'] : $package->weight,
                'volume' => array_key_exists('volume', $input) ? $input['volume'] : $package->volume,
                'note' => array_key_exists('note', $input)
                    ? $this->normalizeOptionalString($input['note'])
                    : $package->note,
                'status' => $matchedTracking ? 'matched' : ($input['status'] ?? 'unmatched'),
                'received_at' => array_key_exists('received_at', $input) ? $input['received_at'] : $package->received_at,
            ]);

            $this->refreshOrderTrackingStatus($matchedTracking);
            $this->syncOrderReceivingStatus($package);

            return $package->fresh(['warehouse', 'order.customer', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse']);
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
}
