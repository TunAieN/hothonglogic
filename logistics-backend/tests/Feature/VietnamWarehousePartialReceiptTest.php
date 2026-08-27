<?php

namespace Tests\Feature;

use App\GraphQL\Resolvers\VietnamWarehouseResolver;
use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\CnWarehouse;
use App\Models\VnBatchReceipt;
use App\Models\VnPackage;
use App\Services\Warehouses\Vietnam\VietnamWarehouseReceiptService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class VietnamWarehousePartialReceiptTest extends TestCase
{
    use DatabaseTransactions;

    public function test_three_matched_packages_are_stored_and_batch_is_completed(): void
    {
        [$batch, $receipt, $packages] = $this->createReceiptScenario(['inspected', 'inspected', 'inspected']);

        app(VietnamWarehouseReceiptService::class)->confirmReceipt($receipt->id);

        $this->assertSame(3, VnPackage::query()->whereIn('id', $packages->pluck('id'))->whereNotNull('received_at')->count());
        $this->assertSame(VnBatchReceipt::STATUS_CONFIRMED, $receipt->fresh()->status);
        $this->assertSame(CnBatch::STATUS_ARRIVED_VN, $batch->fresh()->status);
    }

    public function test_valid_packages_are_stored_while_error_package_stays_pending(): void
    {
        [$batch, $receipt, $packages] = $this->createReceiptScenario(['inspected', 'inspected', 'mismatched']);

        app(VietnamWarehouseReceiptService::class)->confirmReceipt($receipt->id);

        $this->assertNotNull($packages[0]->fresh()->received_at);
        $this->assertNotNull($packages[1]->fresh()->received_at);
        $this->assertNull($packages[2]->fresh()->received_at);
        $this->assertSame(VnBatchReceipt::STATUS_MISMATCHED, $receipt->fresh()->status);
        $this->assertSame(CnBatch::STATUS_EXPORTING, $batch->fresh()->status);

        $errorPackage = $packages[2]->fresh();
        $this->assertSame('pending', $errorPackage->error_resolution_status);
        $this->assertNotNull($errorPackage->error_detected_at);
        $this->assertSame('Sai lệch dữ liệu kiện', $errorPackage->exception_reason);
        $this->assertSame(1.0, (float) $errorPackage->weight_difference);

        $resolver = app(VietnamWarehouseResolver::class);
        $this->assertSame(2, $resolver->packages(null, ['filter' => ['scope' => 'stored']])
            ->where('cn_batch_id', $batch->id)->count());
        $this->assertSame(1, $resolver->packages(null, ['filter' => ['scope' => 'error']])
            ->where('cn_batch_id', $batch->id)->count());
    }

    public function test_two_error_packages_are_queued_individually_and_only_valid_package_is_stored(): void
    {
        [$batch, $receipt, $packages] = $this->createReceiptScenario(['damaged', 'inspected', 'mismatched']);
        $service = app(VietnamWarehouseReceiptService::class);

        $packages[0]->update(['error_resolution_status' => null, 'error_detected_at' => null]);
        $packages[2]->update(['error_resolution_status' => null, 'error_detected_at' => null]);
        $service->moveReceiptToErrorQueue($receipt->id);
        $service->confirmReceipt($receipt->id);

        $resolver = app(VietnamWarehouseResolver::class);
        $this->assertSame(1, $resolver->packages(null, ['filter' => ['scope' => 'stored']])
            ->where('cn_batch_id', $batch->id)->count());
        $this->assertSame(2, $resolver->packages(null, ['filter' => ['scope' => 'error']])
            ->where('cn_batch_id', $batch->id)->count());
        $this->assertSame(2, VnPackage::query()->whereIn('id', [$packages[0]->id, $packages[2]->id])
            ->where('error_resolution_status', 'pending')->whereNotNull('error_detected_at')->count());
        $this->assertNull($packages[0]->fresh()->received_at);
        $this->assertNotNull($packages[1]->fresh()->received_at);
        $this->assertNull($packages[2]->fresh()->received_at);
        $this->assertSame(VnBatchReceipt::STATUS_MISMATCHED, $receipt->fresh()->status);
        $this->assertSame(CnBatch::STATUS_EXPORTING, $batch->fresh()->status);
    }

    public function test_resolving_last_error_stores_package_and_completes_batch(): void
    {
        [$batch, $receipt, $packages] = $this->createReceiptScenario(['inspected', 'inspected', 'mismatched']);
        $service = app(VietnamWarehouseReceiptService::class);
        $service->confirmReceipt($receipt->id);

        $service->resolvePackageDiscrepancy($packages[2]->id, 'Đã cân và kiểm tra lại, hàng đầy đủ.');

        $resolved = $packages[2]->fresh();
        $this->assertNotNull($resolved->received_at);
        $this->assertSame('resolved', $resolved->error_resolution_status);
        $this->assertSame(VnBatchReceipt::STATUS_CONFIRMED, $receipt->fresh()->status);
        $this->assertSame(CnBatch::STATUS_ARRIVED_VN, $batch->fresh()->status);
    }

    public function test_error_progress_can_be_updated_without_storing_the_package(): void
    {
        [, $receipt, $packages] = $this->createReceiptScenario(['mismatched']);

        $updated = app(VietnamWarehouseReceiptService::class)->updatePackageError([
            'package_id' => $packages[0]->id,
            'resolution_status' => 'verifying',
            'resolution_action' => 'Yêu cầu kho Trung Quốc đối chiếu lại.',
            'resolution_result' => 'Đang chờ phản hồi.',
            'expected_completion_at' => '2026-08-28 17:00:00',
            'note' => 'Đã gửi thông tin sai lệch.',
        ]);

        $this->assertSame('verifying', $updated->error_resolution_status);
        $this->assertSame('Yêu cầu kho Trung Quốc đối chiếu lại.', $updated->resolution_action);
        $this->assertSame('Đang chờ phản hồi.', $updated->resolution_result);
        $this->assertNotNull($updated->expected_completion_at);
        $this->assertNull($updated->received_at);
        $this->assertSame(VnBatchReceipt::STATUS_CHECKING, $receipt->fresh()->status);
    }

    private function createReceiptScenario(array $statuses): array
    {
        $suffix = strtoupper(substr(uniqid(), -8));
        $warehouse = CnWarehouse::query()->create([
            'code' => 'T'.$suffix,
            'name' => 'Test China '.$suffix,
            'status' => 'active',
        ]);
        $batch = CnBatch::query()->create([
            'batch_code' => 'TEST-'.$suffix,
            'warehouse_id' => $warehouse->id,
            'destination_warehouse_name' => 'Kho Hà Nội (VN)',
            'total_packages' => count($statuses),
            'status' => CnBatch::STATUS_EXPORTING,
            'shipping_type' => 'normal',
        ]);
        $receipt = VnBatchReceipt::query()->create([
            'cn_batch_id' => $batch->id,
            'batch_code' => $batch->batch_code,
            'status' => VnBatchReceipt::STATUS_CHECKING,
            'total_expected_packages' => count($statuses),
        ]);
        $vnPackages = collect();

        foreach ($statuses as $index => $status) {
            $cnPackage = CnPackage::query()->create([
                'warehouse_id' => $warehouse->id,
                'tracking_number' => 'TEST-'.$suffix.'-'.$index,
                'carrier' => 'Test',
                'weight' => 1,
                'status' => 'matched',
            ]);
            $batch->packages()->attach($cnPackage->id);
            $vnPackages->push(VnPackage::query()->create([
                'vn_batch_receipt_id' => $receipt->id,
                'cn_batch_id' => $batch->id,
                'cn_package_id' => $cnPackage->id,
                'tracking_number_snapshot' => $cnPackage->tracking_number,
                'cn_weight_snapshot' => 1,
                'actual_weight' => $status === 'mismatched' ? 2 : 1,
                'weight_difference' => $status === 'mismatched' ? 1 : 0,
                'physical_condition' => $status === 'damaged' ? 'broken' : 'normal',
                'inspection_status' => $status,
                'requires_item_inspection' => false,
                'item_inspection_status' => 'not_required',
                'exception_reason' => $status === 'damaged' ? 'Kiện bị hư hỏng' : ($status === 'mismatched' ? 'Sai lệch dữ liệu kiện' : null),
                'error_resolution_status' => in_array($status, ['mismatched', 'damaged'], true) ? 'pending' : null,
                'error_detected_at' => in_array($status, ['mismatched', 'damaged'], true) ? now() : null,
                'scanned_at' => now(),
            ]));
        }

        return [$batch, $receipt, $vnPackages];
    }
}
