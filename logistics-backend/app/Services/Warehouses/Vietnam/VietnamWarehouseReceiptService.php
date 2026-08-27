<?php

namespace App\Services\Warehouses\Vietnam;

use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\VnBatchReceipt;
use App\Models\VnPackage;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\HttpException;

class VietnamWarehouseReceiptService
{
    public function findBatchByCode(string $batchCode): CnBatch
    {
        $normalizedCode = $this->normalizeBatchCode($batchCode);

        $batch = CnBatch::query()
            ->with($this->batchRelations())
            ->where('batch_code', $normalizedCode)
            ->first();

        if (! $batch) {
            throw new HttpException(404, 'Khong tim thay ma lo.');
        }

        if (in_array($batch->status, [CnBatch::STATUS_COMPLETED, CnBatch::STATUS_CANCELLED], true)) {
            throw new HttpException(422, 'Lo hang nay khong con kha dung de nhap kho Viet Nam.');
        }

        return $batch;
    }

    public function buildReceiptPayload(CnBatch $batch, ?VnBatchReceipt $receipt): array
    {
        $batch->loadMissing($this->batchRelations());
        $expectedPackages = $batch->packages()->with($this->expectedPackageRelations())->get();
        $loadedReceipt = $receipt?->loadMissing($this->receiptRelations());
        $receivedPackages = $loadedReceipt?->packages ?? new Collection;
        $summary = $this->enrichSummary(
            $this->calculateSummary($expectedPackages, $receivedPackages),
            $batch,
            $loadedReceipt,
        );

        return [
            'batch' => $batch,
            'receipt' => $loadedReceipt,
            'expectedPackages' => $expectedPackages->values()->all(),
            'receivedPackages' => $receivedPackages->values()->all(),
            'summary' => $summary,
        ];
    }

    public function startReceipt(array $input): VnBatchReceipt
    {
        $batchCode = $this->normalizeBatchCode($input['batch_code'] ?? null);

        if ($batchCode === null) {
            throw new HttpException(422, 'Batch code is required.');
        }

        $batch = CnBatch::query()
            ->with($this->batchRelations())
            ->where('batch_code', $batchCode)
            ->lockForUpdate()
            ->first();

        if (! $batch) {
            throw new HttpException(404, 'Khong tim thay ma lo.');
        }

        if ($batch->status !== CnBatch::STATUS_EXPORTING) {
            throw new HttpException(422, 'Chi lo da xuat kho Trung Quoc va dang van chuyen moi duoc tiep nhan tai Viet Nam.');
        }

        $receipt = VnBatchReceipt::query()
            ->with($this->receiptRelations())
            ->where('cn_batch_id', $batch->id)
            ->lockForUpdate()
            ->first();

        if ($receipt && $receipt->status === VnBatchReceipt::STATUS_CONFIRMED) {
            throw new HttpException(422, 'Lo hang nay da duoc xac nhan nhap kho Viet Nam.');
        }

        $expectedPackages = $batch->packages()->with($this->expectedPackageRelations())->get();
        $handlerId = Auth::id();

        $receipt ??= new VnBatchReceipt([
            'cn_batch_id' => $batch->id,
        ]);

        $actualBatchWeight = isset($input['actual_batch_weight']) ? (float) $input['actual_batch_weight'] : null;
        $dispatchBatchWeight = (float) ($batch->actual_batch_weight ?? $batch->total_weight ?? 0);
        $weightDifference = $actualBatchWeight !== null ? round($actualBatchWeight - $dispatchBatchWeight, 2) : null;
        $actualContainerCount = isset($input['actual_container_count']) ? (int) $input['actual_container_count'] : null;
        $expectedContainerCount = (int) ($batch->transport_container_count ?? 0);
        $outerCondition = $this->normalizeCondition($input['outer_condition'] ?? 'normal');
        $requiresResolution = $outerCondition !== 'normal'
            || ($actualContainerCount !== null && $expectedContainerCount > 0 && $actualContainerCount !== $expectedContainerCount)
            || $this->hasWeightMismatch($dispatchBatchWeight, $actualBatchWeight);

        $receipt->fill([
            'vn_warehouse_id' => $input['vn_warehouse_id'] ?? $receipt->vn_warehouse_id,
            'batch_code' => $batchCode,
            'actual_container_count' => $actualContainerCount ?? $receipt->actual_container_count,
            'actual_batch_weight' => $input['actual_batch_weight'] ?? $receipt->actual_batch_weight,
            'package_material_weight' => $input['package_material_weight'] ?? $receipt->package_material_weight,
            'actual_length' => $input['actual_length'] ?? $receipt->actual_length,
            'actual_width' => $input['actual_width'] ?? $receipt->actual_width,
            'actual_height' => $input['actual_height'] ?? $receipt->actual_height,
            'actual_volume' => $input['actual_volume'] ?? $receipt->actual_volume,
            'outer_condition' => $outerCondition,
            'batch_weight_difference' => $weightDifference,
            'requires_resolution' => $requiresResolution,
            'wooden_fee' => $input['wooden_fee'] ?? $receipt->wooden_fee ?? 0,
            'other_fee' => $input['other_fee'] ?? $receipt->other_fee ?? 0,
            'note' => $this->normalizeOptionalString($input['note'] ?? $receipt->note),
            'handled_by' => $handlerId ?: $receipt->handled_by,
            'received_at' => $input['received_at'] ?? $receipt->received_at ?? now(),
            'status' => VnBatchReceipt::STATUS_CHECKING,
            'total_expected_packages' => $expectedPackages->count(),
        ]);
        $receipt->save();

        $summary = $this->calculateSummary($expectedPackages, $receipt->packages()->get());
        $this->syncReceiptCounters($receipt, $summary);

        return $receipt->fresh($this->receiptRelations());
    }

    public function scanPackage(array $input): array
    {
        $receipt = VnBatchReceipt::query()
            ->with($this->receiptRelations())
            ->lockForUpdate()
            ->find($input['receipt_id'] ?? null);

        if (! $receipt) {
            throw new HttpException(404, 'Khong tim thay phieu nhap kho.');
        }

        $this->ensureReceiptIsEditable($receipt);

        $trackingNumber = $this->normalizeTrackingNumber($input['tracking_number'] ?? null);

        if ($trackingNumber === null) {
            throw new HttpException(422, 'Tracking number is required.');
        }

        $batch = $receipt->batch()->with($this->batchRelations())->firstOrFail();
        $expectedPackages = $batch->packages()->with($this->expectedPackageRelations())->get();
        $matchedPackage = $expectedPackages->firstWhere('tracking_number', $trackingNumber);
        $existingScan = $receipt->packages()
            ->where('tracking_number_snapshot', $trackingNumber)
            ->exists();

        if ($existingScan) {
            throw new HttpException(422, 'Ma van don nay da duoc quet trong phieu nhap kho.');
        }

        $physicalCondition = $this->normalizeCondition($input['physical_condition'] ?? 'normal');
        $actualWeight = isset($input['actual_weight']) ? (float) $input['actual_weight'] : null;
        $cnWeight = $matchedPackage?->weight !== null ? (float) $matchedPackage->weight : null;
        $weightDifference = $actualWeight !== null && $cnWeight !== null
            ? round($actualWeight - $cnWeight, 2)
            : null;
        $weightMismatch = $this->hasWeightMismatch($cnWeight, $actualWeight);
        $requiresItemInspection = $matchedPackage !== null
            && $matchedPackage->packageItems->isNotEmpty()
            && ($physicalCondition !== 'normal' || $weightMismatch || (bool) ($input['requires_item_inspection'] ?? false));
        $inspectionStatus = $this->resolveInspectionStatus($matchedPackage, $input['inspection_status'] ?? null);

        if ($matchedPackage !== null && $physicalCondition !== 'normal') {
            $inspectionStatus = VnPackage::STATUS_DAMAGED;
        } elseif ($matchedPackage !== null && $weightMismatch) {
            $inspectionStatus = VnPackage::STATUS_MISMATCHED;
        }
        $hasPackageError = in_array($inspectionStatus, [
            VnPackage::STATUS_DAMAGED,
            VnPackage::STATUS_MISMATCHED,
            VnPackage::STATUS_EXTRA,
        ], true) || $requiresItemInspection;
        $handlerId = Auth::id();

        VnPackage::query()->updateOrCreate(
            [
                'vn_batch_receipt_id' => $receipt->id,
                'tracking_number_snapshot' => $trackingNumber,
            ],
            [
                'cn_batch_id' => $batch->id,
                'cn_package_id' => $matchedPackage?->id,
                'cn_weight_snapshot' => $cnWeight,
                'actual_weight' => $input['actual_weight'] ?? null,
                'weight_difference' => $weightDifference,
                'actual_length' => $input['actual_length'] ?? null,
                'actual_width' => $input['actual_width'] ?? null,
                'actual_height' => $input['actual_height'] ?? null,
                'actual_volume' => $input['actual_volume'] ?? null,
                'physical_condition' => $physicalCondition,
                'requires_item_inspection' => $requiresItemInspection,
                'item_inspection_status' => $requiresItemInspection ? 'pending' : 'not_required',
                'exception_reason' => $this->normalizeOptionalString($input['exception_reason'] ?? null),
                'error_resolution_status' => $hasPackageError ? 'pending' : null,
                'error_detected_at' => $hasPackageError ? now() : null,
                'extra_fee' => $input['extra_fee'] ?? 0,
                'wooden_fee' => $input['wooden_fee'] ?? 0,
                'other_fee' => $input['other_fee'] ?? 0,
                'order_code_snapshot' => $input['order_code_snapshot'] ?? $matchedPackage?->order?->order_code,
                'customer_name_snapshot' => $input['customer_name_snapshot'] ?? $matchedPackage?->order?->customer?->name,
                'inspection_status' => $inspectionStatus,
                'note' => $this->normalizeOptionalString($input['note'] ?? null),
                'handled_by' => $handlerId,
                'scanned_at' => now(),
            ],
        );

        $receipt->refresh();
        $receivedPackages = $receipt->packages()->get();
        $summary = $this->calculateSummary($expectedPackages, $receivedPackages);
        $this->syncReceiptCounters($receipt, $summary);
        $this->finalizeReceiptIfComplete($receipt, $batch);

        return $this->buildReceiptPayload($batch->fresh($this->batchRelations()), $receipt->fresh($this->receiptRelations()));
    }

    public function inspectPackageItems(string|int $packageId, array $items): array
    {
        $package = VnPackage::query()
            ->with(['receipt.batch', 'cnPackage.packageItems.orderItem', 'inspectedItems'])
            ->lockForUpdate()
            ->find($packageId);

        if (! $package || ! $package->receipt) {
            throw new HttpException(404, 'Khong tim thay kien hang can kiem item.');
        }

        $this->ensureReceiptIsEditable($package->receipt);

        if (! $package->cnPackage) {
            throw new HttpException(422, 'Kien hang ngoai lo khong co danh sach item de doi soat.');
        }

        $expectedItems = $package->cnPackage->packageItems;
        $submittedItems = collect($items)->keyBy(fn (array $item) => (string) ($item['order_item_id'] ?? ''));

        if ($expectedItems->isEmpty()) {
            throw new HttpException(422, 'Ma van don nay chua co chi tiet item tu kho Trung Quoc.');
        }

        if ($submittedItems->count() !== $expectedItems->count()
            || $expectedItems->contains(fn ($item) => ! $submittedItems->has((string) $item->order_item_id))) {
            throw new HttpException(422, 'Can kiem tra day du tat ca item trong ma van don.');
        }

        $hasQuantityMismatch = false;
        $hasDamagedItem = false;

        foreach ($expectedItems as $expectedItem) {
            $input = $submittedItems->get((string) $expectedItem->order_item_id);
            $receivedQuantity = max(0, (int) ($input['received_quantity'] ?? 0));
            $condition = $this->normalizeCondition($input['condition_status'] ?? 'normal');
            $orderItem = $expectedItem->orderItem;

            $hasQuantityMismatch = $hasQuantityMismatch || $receivedQuantity !== (int) $expectedItem->quantity;
            $hasDamagedItem = $hasDamagedItem || $condition !== 'normal';

            $package->inspectedItems()->updateOrCreate(
                ['order_item_id' => $expectedItem->order_item_id],
                [
                    'product_name_snapshot' => $orderItem?->product_name ?? 'Item #'.$expectedItem->order_item_id,
                    'variant_snapshot' => collect([$orderItem?->size, $orderItem?->color])->filter()->implode(' / ') ?: null,
                    'expected_quantity' => (int) $expectedItem->quantity,
                    'received_quantity' => $receivedQuantity,
                    'condition_status' => $condition,
                    'note' => $this->normalizeOptionalString($input['note'] ?? null),
                ],
            );
        }

        $inspectionStatus = match (true) {
            $hasDamagedItem => VnPackage::STATUS_DAMAGED,
            $hasQuantityMismatch => VnPackage::STATUS_MISMATCHED,
            default => VnPackage::STATUS_INSPECTED,
        };
        $wasError = $package->error_detected_at !== null
            || in_array($package->inspection_status, [VnPackage::STATUS_DAMAGED, VnPackage::STATUS_MISMATCHED], true);
        $resolvedByItemInspection = $inspectionStatus === VnPackage::STATUS_INSPECTED && $wasError;

        $package->update([
            'inspection_status' => $inspectionStatus,
            'requires_item_inspection' => false,
            'item_inspection_status' => 'completed',
            'error_resolution_status' => $resolvedByItemInspection ? 'resolved' : ($inspectionStatus === VnPackage::STATUS_INSPECTED ? null : 'pending'),
            'resolution_note' => $resolvedByItemInspection ? 'Đã kiểm đủ item, số lượng và tình trạng đều khớp.' : $package->resolution_note,
            'resolved_by' => $resolvedByItemInspection ? (Auth::id() ?: $package->handled_by) : $package->resolved_by,
            'error_resolved_at' => $resolvedByItemInspection ? now() : null,
            'error_detected_at' => $inspectionStatus === VnPackage::STATUS_INSPECTED ? $package->error_detected_at : ($package->error_detected_at ?? now()),
            'received_at' => $resolvedByItemInspection ? now() : $package->received_at,
            'handled_by' => Auth::id() ?: $package->handled_by,
        ]);

        $receipt = $package->receipt->fresh($this->receiptRelations());
        $batch = $receipt->batch()->with($this->batchRelations())->firstOrFail();
        $summary = $this->calculateSummary(
            $batch->packages()->with($this->expectedPackageRelations())->get(),
            $receipt->packages()->get(),
        );
        $this->syncReceiptCounters($receipt, $summary);
        $this->finalizeReceiptIfComplete($receipt, $batch);

        return $this->buildReceiptPayload($batch->fresh($this->batchRelations()), $receipt->fresh($this->receiptRelations()));
    }

    public function resolveReceiptDiscrepancy(string|int $receiptId, mixed $resolutionNote): array
    {
        $receipt = VnBatchReceipt::query()->lockForUpdate()->find($receiptId);

        if (! $receipt) {
            throw new HttpException(404, 'Khong tim thay phieu nhap kho.');
        }

        $this->ensureReceiptIsEditable($receipt);
        $note = $this->normalizeOptionalString($resolutionNote);

        if ($note === null) {
            throw new HttpException(422, 'Can nhap ket qua xu ly chenh lech lo hang.');
        }

        $receipt->update([
            'requires_resolution' => false,
            'note' => trim(collect([$receipt->note, '[Đã xử lý chênh lệch] '.$note])->filter()->implode("\n")),
            'handled_by' => Auth::id() ?: $receipt->handled_by,
        ]);

        $batch = $receipt->batch()->with($this->batchRelations())->firstOrFail();
        $summary = $this->calculateSummary(
            $batch->packages()->with($this->expectedPackageRelations())->get(),
            $receipt->packages()->get(),
        );
        $this->syncReceiptCounters($receipt, $summary);
        $this->finalizeReceiptIfComplete($receipt, $batch);

        return $this->buildReceiptPayload($batch->fresh($this->batchRelations()), $receipt->fresh($this->receiptRelations()));
    }

    public function resolvePackageDiscrepancy(string|int $packageId, mixed $resolutionNote): array
    {
        $package = VnPackage::query()->with('receipt.batch')->lockForUpdate()->find($packageId);

        if (! $package || ! $package->receipt) {
            throw new HttpException(404, 'Khong tim thay kien hang can xu ly.');
        }

        $this->ensureReceiptIsEditable($package->receipt);
        $note = $this->normalizeOptionalString($resolutionNote);

        if ($note === null) {
            throw new HttpException(422, 'Can nhap ket qua xu ly sai lech kien hang.');
        }

        $package->update([
            'inspection_status' => VnPackage::STATUS_INSPECTED,
            'requires_item_inspection' => false,
            'item_inspection_status' => $package->inspectedItems()->exists() ? 'completed' : 'not_required',
            'exception_reason' => trim(collect([$package->exception_reason, '[Đã xử lý] '.$note])->filter()->implode("\n")),
            'error_resolution_status' => 'resolved',
            'resolution_note' => $note,
            'resolved_by' => Auth::id() ?: $package->handled_by,
            'error_resolved_at' => now(),
            'received_at' => now(),
            'handled_by' => Auth::id() ?: $package->handled_by,
        ]);

        $receipt = $package->receipt->fresh($this->receiptRelations());
        $batch = $receipt->batch()->with($this->batchRelations())->firstOrFail();
        $summary = $this->calculateSummary(
            $batch->packages()->with($this->expectedPackageRelations())->get(),
            $receipt->packages()->get(),
        );
        $this->syncReceiptCounters($receipt, $summary);
        $this->finalizeReceiptIfComplete($receipt, $batch);

        return $this->buildReceiptPayload($batch->fresh($this->batchRelations()), $receipt->fresh($this->receiptRelations()));
    }

    public function updatePackageError(array $input): VnPackage
    {
        $package = VnPackage::query()->with(['receipt', 'receipt.warehouse', 'receipt.batch', 'cnPackage.order.customer', 'cnPackage.packageItems.orderItem', 'inspectedItems', 'evidences.creator', 'handler', 'resolver'])
            ->lockForUpdate()->find($input['package_id'] ?? null);

        if (! $package || ! $package->receipt) {
            throw new HttpException(404, 'Khong tim thay kien hang can cap nhat xu ly.');
        }

        $this->ensureReceiptIsEditable($package->receipt);
        if ($package->received_at !== null || $package->error_resolution_status === 'resolved') {
            throw new HttpException(422, 'Kien hang nay da hoan tat xu ly loi.');
        }

        $status = strtolower(trim((string) ($input['resolution_status'] ?? 'pending')));
        if (! in_array($status, ['pending', 'verifying', 'processing', 'rejected'], true)) {
            throw new HttpException(422, 'Trang thai xu ly loi khong hop le.');
        }

        $package->update([
            'error_resolution_status' => $status,
            'resolution_action' => $this->normalizeOptionalString($input['resolution_action'] ?? null),
            'resolution_result' => $this->normalizeOptionalString($input['resolution_result'] ?? null),
            'expected_completion_at' => $input['expected_completion_at'] ?? null,
            'resolution_note' => $this->normalizeOptionalString($input['note'] ?? null),
            'handled_by' => Auth::id() ?: $package->handled_by,
        ]);

        return $package->fresh(['receipt.warehouse', 'receipt.batch', 'cnPackage.order.customer', 'cnPackage.packageItems.orderItem', 'inspectedItems', 'evidences.creator', 'handler', 'resolver']);
    }

    public function removePackage(string|int $id): array
    {
        $package = VnPackage::query()
            ->with(['receipt.batch', 'evidences'])
            ->lockForUpdate()
            ->find($id);

        if (! $package) {
            throw new HttpException(404, 'Khong tim thay kien hang Viet Nam.');
        }

        $receipt = $package->receipt;

        if (! $receipt) {
            throw new HttpException(422, 'Kien hang nay chua thuoc phieu nhap kho hop le.');
        }

        $this->ensureReceiptIsEditable($receipt);

        $batch = $receipt->batch()->with($this->batchRelations())->firstOrFail();
        $evidenceFiles = $package->evidences->map(fn ($evidence) => [$evidence->disk, $evidence->file_path])->all();
        $package->delete();
        DB::afterCommit(function () use ($evidenceFiles) {
            foreach ($evidenceFiles as [$disk, $path]) {
                Storage::disk($disk)->delete($path);
            }
        });

        $receipt->refresh();
        $expectedPackages = $batch->packages()->with($this->expectedPackageRelations())->get();
        $receivedPackages = $receipt->packages()->get();
        $summary = $this->calculateSummary($expectedPackages, $receivedPackages);
        $this->syncReceiptCounters($receipt, $summary);

        return $this->buildReceiptPayload($batch->fresh($this->batchRelations()), $receipt->fresh($this->receiptRelations()));
    }

    public function moveReceiptToErrorQueue(string|int $receiptId): VnBatchReceipt
    {
        $receipt = VnBatchReceipt::query()
            ->with($this->receiptRelations())
            ->lockForUpdate()
            ->find($receiptId);

        if (! $receipt) {
            throw new HttpException(404, 'Khong tim thay phieu nhap kho.');
        }

        if (in_array($receipt->status, [VnBatchReceipt::STATUS_CONFIRMED, VnBatchReceipt::STATUS_CANCELLED], true)) {
            throw new HttpException(422, 'Phieu nhap kho nay khong the chuyen sang cho xu ly loi.');
        }

        $batch = $receipt->batch()->with($this->batchRelations())->firstOrFail();
        $expectedPackages = $batch->packages()->with($this->expectedPackageRelations())->get();
        $receivedPackages = $receipt->packages()->get();
        $summary = $this->calculateSummary($expectedPackages, $receivedPackages);

        $errorPackages = $receivedPackages->filter(fn (VnPackage $package) => $package->received_at === null
            && (in_array($package->inspection_status, [
                VnPackage::STATUS_DAMAGED,
                VnPackage::STATUS_MISMATCHED,
                VnPackage::STATUS_EXTRA,
            ], true) || $package->requires_item_inspection)
        );

        if ($errorPackages->isEmpty()) {
            throw new HttpException(422, 'Phieu nhap kho khong co kien loi de chuyen sang cho xu ly.');
        }

        $detectedAt = now();
        $handlerId = Auth::id();
        foreach ($errorPackages as $package) {
            $package->update([
                'error_resolution_status' => 'pending',
                'error_detected_at' => $package->error_detected_at ?? $package->scanned_at ?? $detectedAt,
                'handled_by' => $package->handled_by ?: $handlerId,
            ]);
        }

        $this->syncReceiptCounters($receipt, $summary, VnBatchReceipt::STATUS_MISMATCHED);
        $receipt->update([
            'status' => VnBatchReceipt::STATUS_MISMATCHED,
            'handled_by' => Auth::id() ?: $receipt->handled_by,
        ]);

        return $receipt->fresh($this->receiptRelations());
    }

    public function confirmReceipt(string|int $receiptId): VnBatchReceipt
    {
        $receipt = VnBatchReceipt::query()
            ->with($this->receiptRelations())
            ->lockForUpdate()
            ->find($receiptId);

        if (! $receipt) {
            throw new HttpException(404, 'Khong tim thay phieu nhap kho.');
        }

        if (in_array($receipt->status, [VnBatchReceipt::STATUS_CONFIRMED, VnBatchReceipt::STATUS_CANCELLED], true)) {
            throw new HttpException(422, 'Phieu nhap kho nay khong the xac nhan them.');
        }

        $batch = $receipt->batch()->with($this->batchRelations())->firstOrFail();
        $expectedPackages = $batch->packages()->with($this->expectedPackageRelations())->get();
        $receivedPackages = $receipt->packages()->get();
        $summary = $this->calculateSummary($expectedPackages, $receivedPackages);

        if ($receipt->requires_resolution) {
            throw new HttpException(422, 'Lo hang con loi cap lo chua xu ly, chua the xac nhan nhap kho.');
        }

        $now = now();
        $receivablePackageIds = $receivedPackages
            ->filter(fn (VnPackage $package) => $package->cn_package_id !== null
                && $package->inspection_status === VnPackage::STATUS_INSPECTED
                && ! $package->requires_item_inspection
                && $package->received_at === null)
            ->pluck('id');

        if ($receivablePackageIds->isEmpty()) {
            throw new HttpException(422, 'Khong co kien hop le moi de xac nhan nhap kho.');
        }

        $receipt->packages()
            ->whereIn('id', $receivablePackageIds)
            ->update(['received_at' => $now]);

        $receipt->update(['handled_by' => Auth::id() ?: $receipt->handled_by]);
        $summary = $this->calculateSummary($expectedPackages, $receipt->packages()->get());
        $this->syncReceiptCounters($receipt, $summary);
        $this->finalizeReceiptIfComplete($receipt, $batch, $now);

        return $receipt->fresh($this->receiptRelations());
    }

    public function calculateSummary(Collection $expectedPackages, Collection $receivedPackages): array
    {
        $expectedIds = $expectedPackages
            ->pluck('id')
            ->map(fn ($id) => (string) $id)
            ->values();

        $receivedMatchedIds = $receivedPackages
            ->filter(fn (VnPackage $package) => $package->cn_package_id !== null)
            ->pluck('cn_package_id')
            ->map(fn ($id) => (string) $id)
            ->unique()
            ->values();

        $missingCount = $expectedIds->diff($receivedMatchedIds)->count();
        $receivedCount = $receivedPackages->count();
        $inspectedCount = $receivedPackages->where('inspection_status', VnPackage::STATUS_INSPECTED)->count();
        $extraCount = $receivedPackages->where('inspection_status', VnPackage::STATUS_EXTRA)->count();
        $damagedCount = $receivedPackages->where('inspection_status', VnPackage::STATUS_DAMAGED)->count();
        $mismatchCount = $receivedPackages->where('inspection_status', VnPackage::STATUS_MISMATCHED)->count();
        $weightMismatchCount = $receivedPackages
            ->filter(fn (VnPackage $package) => $this->hasWeightMismatch($package->cn_weight_snapshot, $package->actual_weight))
            ->count();
        $itemInspectionPendingCount = $receivedPackages
            ->where('requires_item_inspection', true)
            ->count();
        $storedCount = $receivedPackages
            ->filter(fn (VnPackage $package) => $package->cn_package_id !== null && $package->received_at !== null)
            ->count();
        $receivableCount = $receivedPackages
            ->filter(fn (VnPackage $package) => $package->cn_package_id !== null
                && $package->inspection_status === VnPackage::STATUS_INSPECTED
                && ! $package->requires_item_inspection
                && $package->received_at === null)
            ->count();
        $errorCount = $receivedPackages
            ->filter(fn (VnPackage $package) => $package->received_at === null && (
                in_array($package->inspection_status, [VnPackage::STATUS_DAMAGED, VnPackage::STATUS_MISMATCHED, VnPackage::STATUS_EXTRA], true)
                || $package->requires_item_inspection
            ))
            ->count();

        return [
            'expectedCount' => $expectedPackages->count(),
            'receivedCount' => $receivedCount,
            'inspectedCount' => $inspectedCount,
            'extraCount' => $extraCount,
            'damagedCount' => $damagedCount,
            'mismatchCount' => $mismatchCount,
            'weightMismatchCount' => $weightMismatchCount,
            'itemInspectionPendingCount' => $itemInspectionPendingCount,
            'missingCount' => $missingCount,
            'storedCount' => $storedCount,
            'receivableCount' => $receivableCount,
            'errorCount' => $errorCount,
            'matched' => $missingCount === 0
                && $extraCount === 0
                && $damagedCount === 0
                && $mismatchCount === 0
                && $itemInspectionPendingCount === 0,
        ];
    }

    private function syncReceiptCounters(VnBatchReceipt $receipt, array $summary, ?string $forcedStatus = null): void
    {
        $status = $forcedStatus ?? match (true) {
            ($summary['receivedCount'] ?? 0) === 0 => VnBatchReceipt::STATUS_CHECKING,
            ($summary['errorCount'] ?? 0) > 0 || $receipt->requires_resolution => VnBatchReceipt::STATUS_MISMATCHED,
            ($summary['missingCount'] ?? 0) > 0 => VnBatchReceipt::STATUS_CHECKING,
            default => VnBatchReceipt::STATUS_MATCHED,
        };

        if ($receipt->status === VnBatchReceipt::STATUS_CONFIRMED) {
            $status = VnBatchReceipt::STATUS_CONFIRMED;
        }

        $receipt->update([
            'status' => $status,
            'total_expected_packages' => $summary['expectedCount'] ?? 0,
            'total_received_packages' => $summary['receivedCount'] ?? 0,
            'total_inspected_packages' => $summary['inspectedCount'] ?? 0,
            'total_missing_packages' => $summary['missingCount'] ?? 0,
            'total_extra_packages' => $summary['extraCount'] ?? 0,
            'total_damaged_packages' => $summary['damagedCount'] ?? 0,
        ]);
    }

    private function ensureReceiptIsEditable(VnBatchReceipt $receipt): void
    {
        if (in_array($receipt->status, [VnBatchReceipt::STATUS_CONFIRMED, VnBatchReceipt::STATUS_CANCELLED], true)) {
            throw new HttpException(422, 'Phieu nhap kho da bi khoa, khong the chinh sua.');
        }
    }

    private function finalizeReceiptIfComplete(VnBatchReceipt $receipt, CnBatch $batch, mixed $completedAt = null): bool
    {
        $expectedIds = $batch->packages()->pluck('cn_packages.id');
        $storedExpectedCount = $receipt->packages()
            ->whereIn('cn_package_id', $expectedIds)
            ->whereNotNull('received_at')
            ->distinct('cn_package_id')
            ->count('cn_package_id');

        if ($expectedIds->isEmpty() || $storedExpectedCount !== $expectedIds->count() || $receipt->requires_resolution) {
            return false;
        }

        $now = $completedAt ?? now();
        $receipt->update([
            'status' => VnBatchReceipt::STATUS_CONFIRMED,
            'confirmed_at' => $now,
            'handled_by' => Auth::id() ?: $receipt->handled_by,
        ]);
        $batch->update([
            'status' => CnBatch::STATUS_ARRIVED_VN,
            'arrived_at' => $now,
        ]);

        return true;
    }

    private function resolveInspectionStatus(?CnPackage $matchedPackage, mixed $requestedStatus): string
    {
        $normalizedStatus = strtolower(trim((string) ($requestedStatus ?? '')));

        if ($matchedPackage === null) {
            return VnPackage::STATUS_EXTRA;
        }

        if ($normalizedStatus === VnPackage::STATUS_DAMAGED) {
            return VnPackage::STATUS_DAMAGED;
        }

        return VnPackage::STATUS_INSPECTED;
    }

    private function normalizeBatchCode(mixed $value): ?string
    {
        $normalized = strtoupper(trim((string) ($value ?? '')));

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeTrackingNumber(mixed $value): ?string
    {
        $normalized = strtoupper(trim((string) ($value ?? '')));

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeOptionalString(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeCondition(mixed $value): string
    {
        $condition = strtolower(trim((string) $value));
        $allowed = ['normal', 'dented', 'torn', 'wet', 'broken', 'opened', 'damaged', 'other'];

        if (! in_array($condition, $allowed, true)) {
            throw new HttpException(422, 'Tinh trang hang hoa khong hop le.');
        }

        return $condition;
    }

    private function hasWeightMismatch(mixed $expected, mixed $actual): bool
    {
        if ($expected === null || $actual === null || (float) $expected <= 0) {
            return false;
        }

        $expectedWeight = (float) $expected;
        $tolerance = max(0.5, $expectedWeight * 0.02);

        return abs((float) $actual - $expectedWeight) > $tolerance;
    }

    private function summaryHasIssues(array $summary, VnBatchReceipt $receipt): bool
    {
        return ($summary['extraCount'] ?? 0) > 0
            || ($summary['missingCount'] ?? 0) > 0
            || ($summary['damagedCount'] ?? 0) > 0
            || ($summary['mismatchCount'] ?? 0) > 0
            || ($summary['itemInspectionPendingCount'] ?? 0) > 0
            || (bool) $receipt->requires_resolution;
    }

    private function enrichSummary(array $summary, CnBatch $batch, ?VnBatchReceipt $receipt): array
    {
        $expectedContainers = (int) ($batch->transport_container_count ?? 0);
        $actualContainers = $receipt?->actual_container_count;
        $dispatchWeight = (float) ($batch->actual_batch_weight ?? $batch->total_weight ?? 0);
        $batchWeightMismatch = $receipt !== null
            && $this->hasWeightMismatch($dispatchWeight, $receipt->actual_batch_weight);
        $containerMismatch = $receipt !== null
            && $expectedContainers > 0
            && $actualContainers !== null
            && (int) $actualContainers !== $expectedContainers;
        $hasIssues = $receipt !== null && $this->summaryHasIssues($summary, $receipt);

        return [
            ...$summary,
            'batchWeightMismatch' => $batchWeightMismatch,
            'containerMismatch' => $containerMismatch,
            'batchResolutionPending' => (bool) $receipt?->requires_resolution,
            'hasIssues' => $hasIssues,
            'matched' => ($summary['matched'] ?? false) && ! $hasIssues,
        ];
    }

    private function batchRelations(): array
    {
        return [
            'warehouse',
            'packages.order.customer',
            'packages.orderTracking',
            'packages.packageItems.orderItem',
            'vnBatchReceipt.packages.cnPackage.order.customer',
            'vnBatchReceipt.packages.cnPackage.packageItems.orderItem',
            'vnBatchReceipt.packages.inspectedItems',
            'vnBatchReceipt.packages.evidences.creator',
            'vnBatchReceipt.warehouse',
            'vnBatchReceipt.handler',
        ];
    }

    private function expectedPackageRelations(): array
    {
        return [
            'warehouse',
            'order.customer',
            'orderTracking',
            'packageItems.orderItem',
            'currentBatchPackage.batch.warehouse',
        ];
    }

    private function receiptRelations(): array
    {
        return [
            'batch.warehouse',
            'warehouse',
            'packages.cnPackage.order.customer',
            'packages.cnPackage.packageItems.orderItem',
            'packages.inspectedItems',
            'packages.evidences.creator',
            'packages.cnBatch',
            'packages.handler',
            'packages.resolver',
            'handler',
        ];
    }
}
