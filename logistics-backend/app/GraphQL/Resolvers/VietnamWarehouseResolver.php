<?php

namespace App\GraphQL\Resolvers;

use App\Services\VietnamWarehouseReceiptService;
use App\Models\VnPackage;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class VietnamWarehouseResolver
{
    public function __construct(
        private readonly VietnamWarehouseReceiptService $service,
    ) {
    }

    public function cnBatchByCode($_, array $args)
    {
        return $this->service->findBatchByCode($args['batch_code']);
    }

    public function vietnamWarehouseReceipt($_, array $args): array
    {
        $batch = $this->service->findBatchByCode($args['batch_code']);
        $receipt = $batch->vnBatchReceipt;

        return $this->service->buildReceiptPayload($batch, $receipt);
    }

    public function packages($_, array $args): Builder
    {
        $filter = $args['filter'] ?? [];
        $query = VnPackage::query()->with([
            'receipt.warehouse', 'receipt.batch', 'cnPackage.order.customer',
            'cnPackage.packageItems.orderItem', 'inspectedItems', 'evidences.creator', 'handler', 'resolver',
        ]);

        return $query
            ->when($filter['scope'] ?? null, function (Builder $builder, string $scope) {
                if ($scope === 'stored') {
                    $builder->whereNotNull('received_at');
                } elseif ($scope === 'error') {
                    $builder->whereNull('received_at')->where(function (Builder $errorQuery) {
                        $errorQuery->whereIn('inspection_status', [
                            VnPackage::STATUS_DAMAGED,
                            VnPackage::STATUS_MISMATCHED,
                            VnPackage::STATUS_EXTRA,
                        ])->orWhere('requires_item_inspection', true);
                    });
                }
            })
            ->when($filter['tracking_number'] ?? null, fn (Builder $builder, string $value) => $builder->where('tracking_number_snapshot', 'like', '%'.trim($value).'%'))
            ->when($filter['batch_code'] ?? null, fn (Builder $builder, string $value) => $builder->whereHas('receipt', fn (Builder $receipt) => $receipt->where('batch_code', 'like', '%'.trim($value).'%')))
            ->when($filter['customer_name'] ?? null, fn (Builder $builder, string $value) => $builder->where('customer_name_snapshot', 'like', '%'.trim($value).'%'))
            ->when($filter['warehouse_id'] ?? null, fn (Builder $builder, $value) => $builder->whereHas('receipt', fn (Builder $receipt) => $receipt->where('vn_warehouse_id', $value)))
            ->when($filter['warehouse_name'] ?? null, fn (Builder $builder, string $value) => $builder->whereHas('receipt.warehouse', fn (Builder $warehouse) => $warehouse->where('name', 'like', '%'.trim($value).'%')))
            ->when($filter['handled_by'] ?? null, fn (Builder $builder, $value) => $builder->where('handled_by', $value))
            ->when($filter['handler_name'] ?? null, fn (Builder $builder, string $value) => $builder->whereHas('handler', fn (Builder $handler) => $handler->where('name', 'like', '%'.trim($value).'%')))
            ->when($filter['error_type'] ?? null, function (Builder $builder, string $value) {
                if ($value === 'item_inspection') {
                    $builder->where('requires_item_inspection', true);
                } else {
                    $builder->where('inspection_status', $value);
                }
            })
            ->when($filter['resolution_status'] ?? null, fn (Builder $builder, string $value) => $builder->where('error_resolution_status', $value))
            ->when($filter['date_from'] ?? null, fn (Builder $builder, $value) => $builder->whereDate(($filter['scope'] ?? '') === 'stored' ? 'received_at' : 'error_detected_at', '>=', $value))
            ->when($filter['date_to'] ?? null, fn (Builder $builder, $value) => $builder->whereDate(($filter['scope'] ?? '') === 'stored' ? 'received_at' : 'error_detected_at', '<=', $value))
            ->orderByDesc(($filter['scope'] ?? '') === 'stored' ? 'received_at' : 'error_detected_at')
            ->orderByDesc('id');
    }

    public function package($_, array $args): VnPackage
    {
        return $this->packages(null, [])->findOrFail($args['id']);
    }

    public function startVietnamWarehouseReceipt($_, array $args)
    {
        return DB::transaction(fn () => $this->service->startReceipt($args['input'] ?? []));
    }

    public function scanVietnamPackage($_, array $args): array
    {
        return DB::transaction(fn () => $this->service->scanPackage($args['input'] ?? []));
    }

    public function removeVietnamPackage($_, array $args): array
    {
        return DB::transaction(fn () => $this->service->removePackage($args['id']));
    }

    public function inspectVietnamPackageItems($_, array $args): array
    {
        return DB::transaction(fn () => $this->service->inspectPackageItems(
            $args['package_id'],
            $args['items'] ?? [],
        ));
    }

    public function resolveVietnamReceiptDiscrepancy($_, array $args): array
    {
        return DB::transaction(fn () => $this->service->resolveReceiptDiscrepancy(
            $args['receipt_id'],
            $args['resolution_note'] ?? null,
        ));
    }

    public function resolveVietnamPackageDiscrepancy($_, array $args): array
    {
        return DB::transaction(fn () => $this->service->resolvePackageDiscrepancy(
            $args['package_id'],
            $args['resolution_note'] ?? null,
        ));
    }

    public function updateVietnamPackageError($_, array $args): VnPackage
    {
        return DB::transaction(fn () => $this->service->updatePackageError($args['input'] ?? []));
    }

    public function confirmVietnamWarehouseReceipt($_, array $args)
    {
        return DB::transaction(fn () => $this->service->confirmReceipt($args['receipt_id']));
    }

    public function moveVietnamWarehouseReceiptToErrorQueue($_, array $args)
    {
        return DB::transaction(fn () => $this->service->moveReceiptToErrorQueue($args['receipt_id']));
    }
}
