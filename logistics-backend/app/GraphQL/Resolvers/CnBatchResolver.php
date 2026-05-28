<?php

namespace App\GraphQL\Resolvers;

use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\CnWarehouse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
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
            } else {
                $warehouse = CnWarehouse::query()->findOrFail($warehouseId);

                $batch = CnBatch::query()->create([
                    'batch_code' => $this->generateBatchCode($warehouse),
                    'warehouse_id' => $warehouse->id,
                    'destination_warehouse_name' => $this->normalizeOptionalString($input['destination_warehouse_name'] ?? null),
                    'total_packages' => 0,
                    'status' => CnBatch::STATUS_PENDING,
                    'shipping_type' => $this->normalizeShippingType($input['shipping_type'] ?? 'normal'),
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

            if (array_key_exists('status', $input)) {
                $payload['status'] = $this->normalizeBatchStatus($input['status']);
            }

            if ($payload !== []) {
                $batch->update($payload);
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
        $prefix = strtoupper($warehouse->code) . $dateCode;
        $sequence = CnBatch::query()
            ->where('batch_code', 'like', $prefix . '%')
            ->count() + 1;

        return $prefix . $sequence;
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
        ];
    }
}
