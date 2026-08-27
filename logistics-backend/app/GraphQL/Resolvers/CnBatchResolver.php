<?php

namespace App\GraphQL\Resolvers;

use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\CnWarehouse;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CnBatchResolver
{
    public function list(): Builder
    {
        return CnBatch::query()
            ->with($this->relations())
            ->latest('created_at')
            ->latest('id');
    }

    public function show($_, array $args): CnBatch
    {
        return CnBatch::query()
            ->with($this->relations())
            ->findOrFail($args['id']);
    }

    public function addPackages($_, array $args): CnBatch
    {
        return DB::transaction(function () use ($args) {
            $input = $args['input'];
            $packageIds = collect($input['cn_package_ids'] ?? [])
                ->map(fn ($id) => (string) $id)
                ->filter()
                ->unique()
                ->values();

            if ($packageIds->isEmpty()) {
                throw new HttpException(422, 'At least one package must be selected.');
            }

            $packages = CnPackage::query()
                ->with(['warehouse', 'batchPackages'])
                ->whereIn('id', $packageIds)
                ->lockForUpdate()
                ->get();

            if ($packages->count() !== $packageIds->count()) {
                throw new HttpException(404, 'One or more packages were not found.');
            }

            $warehouseIds = $packages->pluck('warehouse_id')->unique();

            if ($warehouseIds->count() !== 1) {
                throw new HttpException(422, 'Packages in the same batch must belong to the same warehouse.');
            }

            if ($packages->contains(fn (CnPackage $package) => $package->batchPackages->isNotEmpty())) {
                throw new HttpException(422, 'One or more packages are already assigned to a batch.');
            }

            $warehouseId = (int) $warehouseIds->first();

            $batch = null;

            if (! empty($input['cn_batch_id'])) {
                $batch = CnBatch::query()
                    ->with('warehouse')
                    ->lockForUpdate()
                    ->findOrFail($input['cn_batch_id']);

                if ((int) $batch->warehouse_id !== $warehouseId) {
                    throw new HttpException(422, 'Existing batch belongs to a different warehouse.');
                }

                if (in_array($batch->status, [CnBatch::STATUS_EXPORTING, CnBatch::STATUS_ARRIVED_VN, CnBatch::STATUS_COMPLETED, CnBatch::STATUS_CANCELLED], true)) {
                    throw new HttpException(422, 'Selected batch cannot receive more packages.');
                }
            } else {
                $warehouse = CnWarehouse::query()->findOrFail($warehouseId);

                $batch = CnBatch::query()->create([
                    'batch_code' => $this->generateBatchCode($warehouse),
                    'warehouse_id' => $warehouse->id,
                    'destination_warehouse_name' => $this->normalizeOptionalString($input['destination_warehouse_name'] ?? null),
                    'total_packages' => 0,
                    'status' => CnBatch::STATUS_PENDING,
                    'shipping_type' => $this->normalizeShippingType($input['shipping_type'] ?? 'normal'),
                    'expected_arrival_at' => $input['expected_arrival_at'] ?? null,
                    'note' => $this->normalizeOptionalString($input['note'] ?? null),
                ]);
            }

            $batch->packages()->attach($packageIds->all());

            $batch->update([
                'total_packages' => $batch->packages()->count(),
                'total_weight' => $this->calculateTotalWeight($batch->packages()->get()),
                'note' => $this->normalizeOptionalString($input['note'] ?? $batch->note),
            ]);

            return $batch->fresh($this->relations());
        });
    }

    public function update($_, array $args): CnBatch
    {
        return DB::transaction(function () use ($args) {
            $batch = CnBatch::query()->lockForUpdate()->findOrFail($args['id']);

            if ($batch->status !== CnBatch::STATUS_PENDING) {
                throw new HttpException(422, 'Only pending batches can be updated.');
            }

            $input = $args['input'] ?? [];
            $payload = [];

            if (array_key_exists('destination_warehouse_name', $input)) {
                $payload['destination_warehouse_name'] = $this->normalizeOptionalString($input['destination_warehouse_name']);
            }

            if (array_key_exists('shipping_type', $input)) {
                $payload['shipping_type'] = $this->normalizeShippingType($input['shipping_type']);
            }

            if (array_key_exists('departed_at', $input)) {
                $payload['departed_at'] = $input['departed_at'];
            }

            if (array_key_exists('expected_arrival_at', $input)) {
                $payload['expected_arrival_at'] = $input['expected_arrival_at'];
            }

            if (array_key_exists('arrived_at', $input)) {
                $payload['arrived_at'] = $input['arrived_at'];
            }

            if (array_key_exists('note', $input)) {
                $payload['note'] = $this->normalizeOptionalString($input['note']);
            }

            if (array_key_exists('freight_cost', $input)) {
                $payload['freight_cost'] = isset($input['freight_cost'])
                    ? max(0, (float) $input['freight_cost'])
                    : null;
            }

            if (array_key_exists('status', $input)) {
                $status = $this->normalizeBatchStatus($input['status']);

                if ($status !== CnBatch::STATUS_PENDING) {
                    throw new HttpException(422, 'Hay dung chuc nang Xuat kho Trung Quoc de ban giao lo van chuyen.');
                }

                $payload['status'] = $status;
            }

            if ($payload !== []) {
                $batch->update($payload);
            }

            if (array_key_exists('packages', $input)) {
                $packageRows = collect($input['packages'] ?? []);

                // An empty client-side Form.List must never detach every package implicitly.
                // Removing all packages is not a valid batch operation in this workflow.
                if ($packageRows->isNotEmpty()) {
                    $this->syncEditablePackages($batch, $packageRows);
                }
            }

            return $batch->fresh($this->relations());
        });
    }

    public function delete($_, array $args): CnBatch
    {
        return DB::transaction(function () use ($args) {
            $batch = CnBatch::query()
                ->with($this->relations())
                ->lockForUpdate()
                ->findOrFail($args['id']);

            if ($batch->status !== CnBatch::STATUS_PENDING) {
                throw new HttpException(422, 'Only pending batches can be deleted.');
            }

            $batch->delete();

            return $batch;
        });
    }

    public function dispatch($_, array $args): CnBatch
    {
        return DB::transaction(function () use ($args) {
            $batch = CnBatch::query()
                ->with($this->relations())
                ->lockForUpdate()
                ->findOrFail($args['id']);

            if ($batch->status !== CnBatch::STATUS_PENDING) {
                throw new HttpException(422, 'Chi lo dang cho xuat kho moi co the ban giao van chuyen.');
            }

            $packages = $batch->packages;

            if ($packages->isEmpty()) {
                throw new HttpException(422, 'Lo hang chua co kien nao de xuat kho.');
            }

            $invalidPackages = $packages
                ->filter(fn (CnPackage $package) => blank($package->tracking_number)
                    || (float) $package->weight <= 0
                    || $package->status !== 'matched'
                    || $package->packageItems->isEmpty())
                ->map(fn (CnPackage $package) => $package->tracking_number ?: '#'.$package->id)
                ->values();

            if ($invalidPackages->isNotEmpty()) {
                throw new HttpException(
                    422,
                    'Cac kien sau chua du ma van don, can nang, trang thai khop hoac chi tiet item: '.$invalidPackages->join(', '),
                );
            }

            $input = $args['input'] ?? [];
            $reviewedPackageIds = collect($input['reviewed_package_ids'] ?? [])
                ->map(fn ($id) => (string) $id)
                ->filter()
                ->unique()
                ->values();
            $expectedPackageIds = $packages->pluck('id')->map(fn ($id) => (string) $id)->sort()->values();

            if ($reviewedPackageIds->sort()->values()->all() !== $expectedPackageIds->all()) {
                throw new HttpException(422, 'Can kiem tra va xac nhan item cua tung ma van don truoc khi xuat kho.');
            }

            $packagingType = strtolower(trim((string) ($input['packaging_type'] ?? '')));

            if (! in_array($packagingType, ['bag', 'carton', 'cardboard', 'wood'], true)) {
                throw new HttpException(422, 'Hinh thuc dong goi khong hop le.');
            }

            $positiveFields = [
                'transport_container_count' => 'So bao/thung van chuyen',
                'actual_batch_weight' => 'Khoi luong thuc te cua lo',
                'actual_length' => 'Chieu dai lo',
                'actual_width' => 'Chieu rong lo',
                'actual_height' => 'Chieu cao lo',
            ];

            foreach ($positiveFields as $field => $label) {
                if ((float) ($input[$field] ?? 0) <= 0) {
                    throw new HttpException(422, $label.' phai lon hon 0.');
                }
            }

            $packageMaterialWeight = (float) ($input['package_material_weight'] ?? 0);
            $actualBatchWeight = (float) $input['actual_batch_weight'];

            if ($packageMaterialWeight < 0 || $packageMaterialWeight >= $actualBatchWeight) {
                throw new HttpException(422, 'Khoi luong vat lieu dong goi phai nho hon khoi luong thuc te cua lo.');
            }

            $packageWeight = (float) $packages->sum(fn (CnPackage $package) => (float) $package->weight);

            if ($actualBatchWeight + 0.05 < $packageWeight) {
                throw new HttpException(422, sprintf(
                    'Khoi luong lo %.2f kg nho hon tong khoi luong cac kien %.2f kg.',
                    $actualBatchWeight,
                    $packageWeight,
                ));
            }

            $departedAt = Carbon::parse($input['departed_at']);
            $expectedArrivalAt = Carbon::parse($input['expected_arrival_at']);

            if ($expectedArrivalAt->lessThanOrEqualTo($departedAt)) {
                throw new HttpException(422, 'Ngay den du kien phai sau thoi gian xuat kho.');
            }

            $length = (float) $input['actual_length'];
            $width = (float) $input['actual_width'];
            $height = (float) $input['actual_height'];
            $snapshot = $packages->map(fn (CnPackage $package) => [
                'package_id' => (string) $package->id,
                'tracking_number' => $package->tracking_number,
                'order_id' => $package->order_id ? (string) $package->order_id : null,
                'order_code' => $package->order?->order_code,
                'customer_name' => $package->order?->customer?->name,
                'weight' => (float) $package->weight,
                'status' => $package->status,
                'package_condition' => $package->package_condition,
                'items' => $package->packageItems->map(fn ($item) => [
                    'order_item_id' => (string) $item->order_item_id,
                    'product_name' => $item->orderItem?->product_name,
                    'size' => $item->orderItem?->size,
                    'color' => $item->orderItem?->color,
                    'quantity' => (int) $item->quantity,
                ])->values()->all(),
            ])->values()->all();

            $batch->update([
                'destination_warehouse_name' => trim((string) $input['destination_warehouse_name']),
                'shipping_type' => $this->normalizeShippingType($input['shipping_type']),
                'packaging_type' => $packagingType,
                'transport_container_count' => (int) $input['transport_container_count'],
                'actual_batch_weight' => $actualBatchWeight,
                'package_material_weight' => $packageMaterialWeight,
                'actual_length' => $length,
                'actual_width' => $width,
                'actual_height' => $height,
                'actual_volume' => round(($length * $width * $height) / 1_000_000, 4),
                'carrier_name' => $this->requiredString($input['carrier_name'] ?? null, 'Don vi van chuyen'),
                'transport_code' => $this->normalizeOptionalString($input['transport_code'] ?? null),
                'route_name' => $this->normalizeOptionalString($input['route_name'] ?? null),
                'vehicle_plate' => $this->normalizeOptionalString($input['vehicle_plate'] ?? null),
                'driver_name' => $this->normalizeOptionalString($input['driver_name'] ?? null),
                'driver_phone' => $this->normalizeOptionalString($input['driver_phone'] ?? null),
                'freight_cost' => isset($input['freight_cost']) ? max(0, (float) $input['freight_cost']) : null,
                'departed_at' => $departedAt,
                'expected_arrival_at' => $expectedArrivalAt,
                'handed_over_by' => Auth::id(),
                'handed_over_at' => now(),
                'dispatch_snapshot' => [
                    'batch_code' => $batch->batch_code,
                    'warehouse_id' => (string) $batch->warehouse_id,
                    'package_count' => $packages->count(),
                    'package_weight' => round($packageWeight, 2),
                    'item_reviewed_package_ids' => $reviewedPackageIds->all(),
                    'packages' => $snapshot,
                ],
                'dispatch_note' => $this->normalizeOptionalString($input['dispatch_note'] ?? null),
                'status' => CnBatch::STATUS_EXPORTING,
            ]);

            return $batch->fresh($this->relations());
        });
    }

    public function createVietnamInboundTask($_, array $args): array
    {
        return DB::transaction(function () use ($args) {
            $batchIds = collect($args['input']['cn_batch_ids'] ?? [])
                ->map(fn ($id) => (string) $id)
                ->filter()
                ->unique()
                ->values();

            if ($batchIds->isEmpty()) {
                throw new HttpException(422, 'At least one batch must be selected.');
            }

            $batches = CnBatch::query()
                ->with($this->relations())
                ->whereIn('id', $batchIds)
                ->lockForUpdate()
                ->get();

            if ($batches->count() !== $batchIds->count()) {
                throw new HttpException(404, 'One or more batches were not found.');
            }

            $invalidBatch = $batches->first(fn (CnBatch $batch) => $batch->status !== CnBatch::STATUS_ARRIVED_VN);

            if ($invalidBatch) {
                throw new HttpException(422, 'Only batches that have arrived in Vietnam can create inbound tasks.');
            }

            $now = now();

            foreach ($batches as $batch) {
                $batch->update([
                    'status' => CnBatch::STATUS_COMPLETED,
                    'arrived_at' => $batch->arrived_at ?? $now,
                ]);
            }

            $freshBatches = CnBatch::query()
                ->with($this->relations())
                ->whereIn('id', $batchIds)
                ->get();

            return [
                'batch_ids' => $freshBatches->pluck('id')->all(),
                'total_batches' => $freshBatches->count(),
                'total_packages' => $freshBatches->sum(fn (CnBatch $batch) => $batch->packages->count()),
                'total_weight' => (float) $freshBatches->sum(fn (CnBatch $batch) => (float) ($batch->total_weight ?? 0)),
                'batches' => $freshBatches->values()->all(),
            ];
        });
    }

    private function generateBatchCode(CnWarehouse $warehouse): string
    {
        $dateCode = now()->format('dmY');
        $prefix = strtoupper($warehouse->code).$dateCode;
        $sequence = CnBatch::query()
            ->where('batch_code', 'like', $prefix.'%')
            ->count() + 1;

        return $prefix.$sequence;
    }

    private function syncEditablePackages(CnBatch $batch, Collection $rows): void
    {
        if ($rows->isEmpty()) {
            throw new HttpException(422, 'Lo hang phai co it nhat mot ma van don.');
        }

        $normalizedRows = $rows->map(function (array $row) {
            $trackingNumber = strtoupper(trim((string) ($row['tracking_number'] ?? '')));

            if ($trackingNumber === '') {
                throw new HttpException(422, 'Ma van don la bat buoc.');
            }

            $weight = (float) ($row['weight'] ?? 0);

            if ($weight <= 0) {
                throw new HttpException(422, 'Khoi luong kien phai lon hon 0.');
            }

            foreach (['actual_length', 'actual_width', 'actual_height'] as $dimension) {
                if (isset($row[$dimension]) && (float) $row[$dimension] < 0) {
                    throw new HttpException(422, 'Kich thuoc kien khong duoc am.');
                }
            }

            return [
                'id' => isset($row['id']) ? (string) $row['id'] : null,
                'tracking_number' => $trackingNumber,
                'weight' => $weight,
                'actual_length' => isset($row['actual_length']) ? (float) $row['actual_length'] : null,
                'actual_width' => isset($row['actual_width']) ? (float) $row['actual_width'] : null,
                'actual_height' => isset($row['actual_height']) ? (float) $row['actual_height'] : null,
            ];
        })->values();

        if ($normalizedRows->pluck('tracking_number')->duplicates()->isNotEmpty()) {
            throw new HttpException(422, 'Danh sach lo hang co ma van don bi trung.');
        }

        $currentPackageIds = $batch->packages()->pluck('cn_packages.id')->map(fn ($id) => (string) $id);
        $resolvedPackageIds = collect();

        foreach ($normalizedRows as $row) {
            if ($row['id'] !== null) {
                if (! $currentPackageIds->contains($row['id'])) {
                    throw new HttpException(422, 'Kien hang khong thuoc lo dang sua.');
                }

                $package = CnPackage::query()->lockForUpdate()->findOrFail($row['id']);
            } else {
                $package = CnPackage::query()
                    ->where('warehouse_id', $batch->warehouse_id)
                    ->where('tracking_number', $row['tracking_number'])
                    ->lockForUpdate()
                    ->first();

                if (! $package) {
                    throw new HttpException(422, 'Ma van don '.$row['tracking_number'].' chua ton tai trong kho Trung Quoc.');
                }

                $assignedToAnotherBatch = $package->batchPackages()
                    ->where('cn_batch_id', '!=', $batch->id)
                    ->exists();

                if ($assignedToAnotherBatch) {
                    throw new HttpException(422, 'Ma van don '.$row['tracking_number'].' da thuoc lo khac.');
                }
            }

            $length = $row['actual_length'];
            $width = $row['actual_width'];
            $height = $row['actual_height'];
            $hasDimensions = $length > 0 && $width > 0 && $height > 0;
            $volume = $hasDimensions ? round(($length * $width * $height) / 1_000_000, 4) : null;
            $volumetricWeight = $hasDimensions ? round(($length * $width * $height) / 6000, 2) : null;

            $package->update([
                'weight' => $row['weight'],
                'actual_length' => $length,
                'actual_width' => $width,
                'actual_height' => $height,
                'volume' => $volume,
                'volumetric_weight' => $volumetricWeight,
                'chargeable_weight' => max($row['weight'], $volumetricWeight ?? 0),
            ]);

            if (! $currentPackageIds->contains((string) $package->id)) {
                $batch->packages()->attach($package->id);
            }

            $resolvedPackageIds->push((string) $package->id);
        }

        $removedPackageIds = $currentPackageIds->diff($resolvedPackageIds);

        if ($removedPackageIds->isNotEmpty()) {
            $batch->packages()->detach($removedPackageIds->all());
        }

        $freshPackages = $batch->packages()->get();
        $batch->update([
            'total_packages' => $freshPackages->count(),
            'total_weight' => $this->calculateTotalWeight($freshPackages),
        ]);
    }

    private function calculateTotalWeight(Collection $packages): float
    {
        return (float) $packages->sum(fn (CnPackage $package) => (float) ($package->weight ?? 0));
    }

    private function normalizeOptionalString(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    private function requiredString(mixed $value, string $label): string
    {
        $normalized = $this->normalizeOptionalString($value);

        if ($normalized === null) {
            throw new HttpException(422, $label.' la bat buoc.');
        }

        return $normalized;
    }

    private function normalizeBatchStatus(mixed $value): string
    {
        $status = strtolower(trim((string) $value));

        if (! in_array($status, CnBatch::VALID_STATUSES, true)) {
            throw new HttpException(422, 'Invalid batch status.');
        }

        return $status;
    }

    private function normalizeShippingType(mixed $value): string
    {
        $type = strtolower(trim((string) $value));

        if (! in_array($type, ['fast', 'normal'], true)) {
            throw new HttpException(422, 'Invalid shipping type.');
        }

        return $type;
    }

    private function relations(): array
    {
        return [
            'warehouse',
            'batchPackages.package.order.customer',
            'batchPackages.package.orderTracking',
            'packages.order.customer',
            'packages.orderTracking',
            'packages.packageItems.orderItem',
        ];
    }
}
