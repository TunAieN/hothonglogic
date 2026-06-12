<?php

namespace App\Services;

use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\VnBatchReceipt;
use App\Models\VnPackage;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
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
        $receivedPackages = $loadedReceipt?->packages ?? new Collection();
        $summary = $this->calculateSummary($expectedPackages, $receivedPackages);

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

        if (! in_array($batch->status, [CnBatch::STATUS_PENDING, CnBatch::STATUS_EXPORTING], true)) {
            throw new HttpException(422, 'Chi co the bat dau nhap kho cho lo dang cho hoac dang van chuyen.');
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

        $receipt->fill([
            'vn_warehouse_id' => $input['vn_warehouse_id'] ?? $receipt->vn_warehouse_id,
            'batch_code' => $batchCode,
            'actual_batch_weight' => $input['actual_batch_weight'] ?? $receipt->actual_batch_weight,
            'package_material_weight' => $input['package_material_weight'] ?? $receipt->package_material_weight,
            'actual_length' => $input['actual_length'] ?? $receipt->actual_length,
            'actual_width' => $input['actual_width'] ?? $receipt->actual_width,
            'actual_height' => $input['actual_height'] ?? $receipt->actual_height,
            'actual_volume' => $input['actual_volume'] ?? $receipt->actual_volume,
            'wooden_fee' => $input['wooden_fee'] ?? $receipt->wooden_fee ?? 0,
            'other_fee' => $input['other_fee'] ?? $receipt->other_fee ?? 0,
            'note' => $this->normalizeOptionalString($input['note'] ?? $receipt->note),
            'handled_by' => $handlerId ?: $receipt->handled_by,
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
        $inspectionStatus = $this->resolveInspectionStatus($matchedPackage, $input['inspection_status'] ?? null);
        $handlerId = Auth::id();

        VnPackage::query()->updateOrCreate(
            [
                'vn_batch_receipt_id' => $receipt->id,
                'tracking_number_snapshot' => $trackingNumber,
            ],
            [
                'cn_batch_id' => $batch->id,
                'cn_package_id' => $matchedPackage?->id,
                'actual_weight' => $input['actual_weight'] ?? null,
                'actual_length' => $input['actual_length'] ?? null,
                'actual_width' => $input['actual_width'] ?? null,
                'actual_height' => $input['actual_height'] ?? null,
                'actual_volume' => $input['actual_volume'] ?? null,
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

        return $this->buildReceiptPayload($batch->fresh($this->batchRelations()), $receipt->fresh($this->receiptRelations()));
    }

    public function removePackage(string|int $id): array
    {
        $package = VnPackage::query()
            ->with(['receipt.batch'])
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
        $package->delete();

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

        if (($summary['extraCount'] ?? 0) === 0
            && ($summary['missingCount'] ?? 0) === 0
            && ($summary['damagedCount'] ?? 0) === 0) {
            throw new HttpException(422, 'Phieu nhap kho khong co loi de chuyen sang cho xu ly.');
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

        if (($summary['extraCount'] ?? 0) > 0
            || ($summary['missingCount'] ?? 0) > 0
            || ($summary['damagedCount'] ?? 0) > 0) {
            throw new HttpException(422, 'Lo hang con loi doi soat, chua the xac nhan nhap kho.');
        }

        $now = now();

        $this->syncReceiptCounters($receipt, $summary);
        $receipt->update([
            'status' => VnBatchReceipt::STATUS_CONFIRMED,
            'confirmed_at' => $now,
            'handled_by' => Auth::id() ?: $receipt->handled_by,
        ]);

        $batch->update([
            'status' => CnBatch::STATUS_ARRIVED_VN,
            'arrived_at' => $now,
        ]);

        $receipt->packages()
            ->whereNull('received_at')
            ->update(['received_at' => $now]);

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

        return [
            'expectedCount' => $expectedPackages->count(),
            'receivedCount' => $receivedCount,
            'inspectedCount' => $inspectedCount,
            'extraCount' => $extraCount,
            'damagedCount' => $damagedCount,
            'missingCount' => $missingCount,
            'matched' => $missingCount === 0 && $extraCount === 0 && $damagedCount === 0,
        ];
    }

    private function syncReceiptCounters(VnBatchReceipt $receipt, array $summary, ?string $forcedStatus = null): void
    {
        $status = $forcedStatus ?? match (true) {
            ($summary['receivedCount'] ?? 0) === 0 => VnBatchReceipt::STATUS_CHECKING,
            ($summary['missingCount'] ?? 0) === 0
                && ($summary['extraCount'] ?? 0) === 0
                && ($summary['damagedCount'] ?? 0) === 0 => VnBatchReceipt::STATUS_MATCHED,
            default => VnBatchReceipt::STATUS_MISMATCHED,
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

    private function batchRelations(): array
    {
        return [
            'warehouse',
            'packages.order.customer',
            'packages.orderTracking',
            'vnBatchReceipt.packages.cnPackage.order.customer',
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
            'currentBatchPackage.batch.warehouse',
        ];
    }

    private function receiptRelations(): array
    {
        return [
            'batch.warehouse',
            'warehouse',
            'packages.cnPackage.order.customer',
            'packages.cnBatch',
            'packages.handler',
            'handler',
        ];
    }
}
