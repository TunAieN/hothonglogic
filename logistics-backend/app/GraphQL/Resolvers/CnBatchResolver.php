<?php

namespace App\GraphQL\Resolvers;

use App\Exceptions\CnPackageInputException;
use App\Models\AuditLog;
use App\Models\CnBatch;
use App\Models\CnPackage;
use App\Models\CnWarehouse;
use App\Models\VnWarehouse;
use App\Services\Auth\PermissionService;
use App\Support\BusinessWriteGuard;
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
        $query = CnBatch::query();
        $ids = $this->allowedWarehouses();
        if ($ids !== null) {
            $query->whereIn('warehouse_id', $ids);
        }

        return $query
            ->with($this->relations())
            ->latest('created_at')
            ->latest('id');
    }

    public function show($_, array $args): CnBatch
    {
        $batch = CnBatch::query()->findOrFail($args['id']);
        $this->assertSourceAccess($batch->warehouse_id);

        return $batch->load($this->relations());
    }

    public function listForPackages($_, array $args): Builder
    {
        $this->assertSourceAccess($args['warehouse_id']);
        $query = CnBatch::query()->where('warehouse_id', $args['warehouse_id']);
        $status = $args['status'] ?? CnBatch::STATUS_PENDING;
        if (in_array($status, CnBatch::VALID_STATUSES, true)) {
            $query->where('status', $status);
        } elseif ($status !== 'all') {
            throw new CnPackageInputException('Trạng thái lô hàng không hợp lệ.');
        }

        $search = trim((string) ($args['search'] ?? ''));
        if ($search !== '') {
            $pattern = '%'.strtr(mb_substr($search, 0, 100), ['!' => '!!', '%' => '!%', '_' => '!_']).'%';
            $query->where(fn (Builder $rows) => $rows
                ->whereRaw("batch_code LIKE ? ESCAPE '!'", [$pattern])
                ->orWhereRaw("note LIKE ? ESCAPE '!'", [$pattern]));
        }

        $direction = ($args['oldest_first'] ?? false) ? 'asc' : 'desc';

        return $query->orderBy('created_at', $direction)->orderBy('id', $direction);
    }

    public function receivingOptions($_, array $args): array
    {
        $this->assertSourceAccess($args['warehouse_id']);
        $source = CnWarehouse::query()->find($args['warehouse_id']);
        if (! $source) {
            throw new CnPackageInputException('Không tìm thấy kho Trung Quốc nguồn.');
        }

        return [
            'preview_code' => $this->generateBatchCode($source),
            'destinations' => VnWarehouse::query()->where('status', 'active')->orderBy('name')->orderBy('id')->get(),
        ];
    }

    public function dispatchReview($_, array $args): array
    {
        $batch = CnBatch::query()->findOrFail($args['id']);
        $this->assertSourceAccess($batch->warehouse_id);
        $batch->load(['packages.packageItems', 'destinationWarehouse']);
        $canDispatch = app(PermissionService::class)->allows(Auth::user(), 'cn_batches.dispatch');

        return $this->reviewState($batch, $batch->packages) + [
            'destination_ready' => $batch->destinationWarehouse?->status === 'active',
            'destinations' => $canDispatch && $batch->status === CnBatch::STATUS_PENDING
                ? VnWarehouse::query()->where('status', 'active')->orderBy('name')->get() : [],
        ];
    }

    public function addPackages($_, array $args): CnBatch
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($args) {
            $input = $args['input'];
            $packageIds = collect($input['cn_package_ids'] ?? [])
                ->map(fn ($id) => (string) $id)
                ->filter()
                ->unique()
                ->values();

            if ($packageIds->isEmpty()) {
                throw new CnPackageInputException('Vui lòng chọn ít nhất một kiện hàng.');
            }

            $packages = CnPackage::query()
                ->withExists(['batchPackages', 'packageItems' => fn (Builder $query) => $query->where('quantity', '>', 0), 'vnPackages'])
                ->whereIn('id', $packageIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            if ($packages->count() !== $packageIds->count()) {
                throw new CnPackageInputException('Một hoặc nhiều kiện không còn tồn tại.');
            }

            $warehouseIds = $packages->pluck('warehouse_id')->unique();

            if ($warehouseIds->count() !== 1) {
                throw new CnPackageInputException('Các kiện phải thuộc cùng một kho Trung Quốc.');
            }

            if ($packages->contains(fn (CnPackage $package) => $package->batch_packages_exists || $package->vn_packages_exists)) {
                throw new CnPackageInputException('Một hoặc nhiều kiện đã thuộc lô hoặc đã nhập kho Việt Nam.');
            }
            if ($packages->contains(fn (CnPackage $package) => ! $package->package_items_exists)) {
                throw new CnPackageInputException('Vui lòng xác nhận sản phẩm của từng kiện trước khi thêm vào lô.');
            }

            $warehouseId = (int) $warehouseIds->first();
            $this->assertSourceAccess($warehouseId);
            foreach ($packages as $package) {
                $issues = $this->packageIssues($package, $warehouseId);
                if ($issues !== []) {
                    throw new CnPackageInputException(($package->tracking_number ?: '#'.$package->id).': '.implode(', ', $issues).'.');
                }
            }

            $batch = null;

            if (! empty($input['cn_batch_id'])) {
                if (! app(PermissionService::class)->allows(Auth::user(), 'cn_batches.read')) {
                    throw new CnPackageInputException('Bạn không có quyền xem lô hàng hiện có.', null, 'CN_BATCH_FORBIDDEN', 403);
                }
                $batch = CnBatch::query()
                    ->lockForUpdate()
                    ->find($input['cn_batch_id']);

                if (! $batch) {
                    throw new CnPackageInputException('Lô hàng đã chọn không còn tồn tại.');
                }

                if ((int) $batch->warehouse_id !== $warehouseId) {
                    throw new CnPackageInputException('Lô hàng đã chọn thuộc kho Trung Quốc khác.');
                }

                if ($batch->status !== CnBatch::STATUS_PENDING) {
                    throw new CnPackageInputException('Lô hàng đã chọn không còn nhận thêm kiện.');
                }
            } else {
                $warehouse = CnWarehouse::query()->lockForUpdate()->findOrFail($warehouseId);
                $destination = VnWarehouse::query()->lockForUpdate()->find($input['destination_warehouse_id'] ?? null);
                if (! $destination || $destination->status !== 'active') {
                    throw new CnPackageInputException('Vui lòng chọn kho đích Việt Nam đang hoạt động.', 'destination_warehouse_id');
                }
                $shippingType = $input['shipping_type'] ?? 'normal';
                if (! in_array($shippingType, ['fast', 'normal'], true)) {
                    throw new CnPackageInputException('Hình thức vận chuyển không hợp lệ.', 'shipping_type');
                }
                $note = $this->normalizeOptionalString($input['note'] ?? null);
                if ($note !== null && mb_strlen($note) > 500) {
                    throw new CnPackageInputException('Ghi chú tối đa 500 ký tự.', 'note');
                }

                $batch = CnBatch::query()->create([
                    'batch_code' => $this->generateBatchCode($warehouse, true),
                    'warehouse_id' => $warehouse->id,
                    'destination_warehouse_id' => $destination->id,
                    'destination_warehouse_name' => $destination->name,
                    'total_packages' => 0,
                    'status' => CnBatch::STATUS_PENDING,
                    'shipping_type' => $shippingType,
                    'expected_arrival_at' => $input['expected_arrival_at'] ?? null,
                    'note' => $note,
                ]);
            }

            $batch->packages()->attach($packageIds->all());

            $batch->update([
                'total_packages' => $batch->packages()->count(),
                'total_weight' => $this->calculateTotalWeight($batch->packages()->get()),
            ]);

            $this->audit($batch, empty($input['cn_batch_id']) ? 'cn_batch_created' : 'cn_batch_packages_added', [], [
                'package_ids_added' => $packageIds->all(),
                'destination_warehouse_id' => $batch->destination_warehouse_id,
                'status' => $batch->status,
            ]);

            return $batch->fresh($this->relations());
        }, 3);
    }

    public function update($_, array $args): CnBatch
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($args) {
            $batch = CnBatch::query()->lockForUpdate()->findOrFail($args['id']);
            $this->assertSourceAccess($batch->warehouse_id);

            if ($batch->status !== CnBatch::STATUS_PENDING) {
                throw new HttpException(422, 'Only pending batches can be updated.');
            }

            $before = $this->editableAuditState($batch);
            $input = $args['input'] ?? [];
            $payload = [];

            if (array_key_exists('destination_warehouse_name', $input)) {
                $payload['destination_warehouse_name'] = $this->normalizeOptionalString($input['destination_warehouse_name']);
                if ($payload['destination_warehouse_name'] !== $batch->destination_warehouse_name) {
                    $payload['destination_warehouse_id'] = null;
                }
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

            $after = $this->editableAuditState($batch);
            if ($before !== $after) {
                $this->audit($batch, 'cn_batch_updated', $before, $after);
            }

            return $batch->fresh($this->relations());
        });
    }

    public function delete($_, array $args): CnBatch
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($args) {
            $batch = CnBatch::query()
                ->with($this->relations())
                ->lockForUpdate()
                ->findOrFail($args['id']);
            $this->assertSourceAccess($batch->warehouse_id);

            if ($batch->status !== CnBatch::STATUS_PENDING) {
                throw new HttpException(422, 'Only pending batches can be deleted.');
            }

            $batch->delete();

            return $batch;
        });
    }

    public function dispatch($_, array $args): CnBatch
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($args) {
            $batch = CnBatch::query()->lockForUpdate()->findOrFail($args['id']);
            $this->assertSourceAccess($batch->warehouse_id);
            $permissions = app(PermissionService::class);
            if (! $permissions->allows(Auth::user(), 'cn_batches.read') || ! $permissions->allows(Auth::user(), 'cn_batches.dispatch')) {
                throw new CnPackageInputException('Bạn không có quyền xem hoặc xuất lô hàng.', null, 'CN_BATCH_FORBIDDEN', 403);
            }
            $packages = $batch->packages()->orderBy('cn_packages.id')->lockForUpdate()
                ->with(['packageItems.orderItem', 'order.customer', 'orderTracking'])->get();
            $input = $args['input'] ?? [];
            $review = $this->reviewState($batch, $packages);
            if ($review['issues'] !== []) {
                throw new CnPackageInputException($review['issues'][0]);
            }
            foreach ($review['packages'] as $packageReview) {
                if ($packageReview['issues'] !== []) {
                    $package = $packages->firstWhere('id', $packageReview['id']);
                    throw new CnPackageInputException(($package->tracking_number ?: '#'.$package->id).': '.implode(', ', $packageReview['issues']).'.');
                }
            }
            if ($review['version'] !== ($input['review_version'] ?? null)) {
                throw new CnPackageInputException('Dữ liệu lô đã thay đổi. Hãy tải lại lô và rà soát trước khi xuất.');
            }
            if (! ($input['review_confirmed'] ?? false)) {
                throw new CnPackageInputException('Cần xác nhận danh sách kiện, ngoại lệ và thông tin vận chuyển.');
            }
            $destination = VnWarehouse::query()->lockForUpdate()->find($input['destination_warehouse_id'] ?? null);
            if (! $destination || $destination->status !== 'active') {
                throw new CnPackageInputException('Kho nhận Việt Nam không còn hoạt động. Hãy chọn lại kho nhận.');
            }

            $reviewedPackageIds = collect($input['reviewed_package_ids'] ?? [])
                ->map(fn ($id) => (string) $id)
                ->filter()
                ->unique()
                ->values();
            $expectedPackageIds = $packages->pluck('id')->map(fn ($id) => (string) $id)->sort()->values();

            if ($reviewedPackageIds->sort()->values()->all() !== $expectedPackageIds->all()) {
                throw new CnPackageInputException('Cần xác nhận đã rà soát từng kiện trước khi xuất kho.');
            }

            $packagingType = strtolower(trim((string) ($input['packaging_type'] ?? '')));

            if (! in_array($packagingType, ['bag', 'carton', 'cardboard', 'wood'], true)) {
                throw new CnPackageInputException('Hình thức đóng gói không hợp lệ.');
            }

            $positiveFields = [
                'transport_container_count' => 'Số bao/thùng vận chuyển',
                'actual_batch_weight' => 'Khối lượng thực tế của lô',
                'actual_length' => 'Chiều dài lô',
                'actual_width' => 'Chiều rộng lô',
                'actual_height' => 'Chiều cao lô',
            ];

            foreach ($positiveFields as $field => $label) {
                if ((float) ($input[$field] ?? 0) <= 0) {
                    throw new CnPackageInputException($label.' phải lớn hơn 0.');
                }
            }

            $packageMaterialWeight = (float) ($input['package_material_weight'] ?? 0);
            $actualBatchWeight = (float) $input['actual_batch_weight'];

            if ($packageMaterialWeight < 0 || $packageMaterialWeight >= $actualBatchWeight) {
                throw new CnPackageInputException('Khối lượng vật liệu đóng gói phải nhỏ hơn khối lượng thực tế của lô.');
            }

            $packageWeight = (float) $packages->sum(fn (CnPackage $package) => (float) $package->weight);

            if ($actualBatchWeight + 0.05 < $packageWeight) {
                throw new CnPackageInputException(sprintf(
                    'Khối lượng lô %.2f kg nhỏ hơn tổng khối lượng các kiện %.2f kg.',
                    $actualBatchWeight,
                    $packageWeight,
                ));
            }

            $departedAt = Carbon::parse($input['departed_at']);
            $expectedArrivalAt = Carbon::parse($input['expected_arrival_at']);
            if ($departedAt->isFuture()) {
                throw new CnPackageInputException('Thời gian xuất thực tế không được ở tương lai.');
            }

            if ($expectedArrivalAt->lessThanOrEqualTo($departedAt)) {
                throw new CnPackageInputException('Ngày đến dự kiến phải sau thời gian xuất kho.');
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

            $carrierName = $this->normalizeOptionalString($input['carrier_name'] ?? null);
            if ($carrierName === null) {
                throw new CnPackageInputException('Vui lòng nhập đơn vị vận chuyển.');
            }
            if (! in_array($input['shipping_type'] ?? null, ['fast', 'normal'], true)) {
                throw new CnPackageInputException('Hình thức vận chuyển không hợp lệ.');
            }
            $batch->update([
                'destination_warehouse_name' => $destination->name,
                'destination_warehouse_id' => $destination->id,
                'shipping_type' => $this->normalizeShippingType($input['shipping_type']),
                'packaging_type' => $packagingType,
                'transport_container_count' => (int) $input['transport_container_count'],
                'actual_batch_weight' => $actualBatchWeight,
                'package_material_weight' => $packageMaterialWeight,
                'actual_length' => $length,
                'actual_width' => $width,
                'actual_height' => $height,
                'actual_volume' => round(($length * $width * $height) / 1_000_000, 4),
                'carrier_name' => $carrierName,
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
            $this->audit($batch, 'cn_batch_dispatched', ['status' => CnBatch::STATUS_PENDING], [
                'status' => $batch->status, 'destination_warehouse_id' => $destination->id,
                'reviewed_package_ids' => $reviewedPackageIds->all(), 'departed_at' => $departedAt->toDateTimeString(),
            ]);

            return $batch->fresh($this->relations());
        }, 3);
    }

    public function createVietnamInboundTask($_, array $args): array
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

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
            foreach ($batches as $batch) {
                $this->assertSourceAccess($batch->warehouse_id);
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

    private function generateBatchCode(CnWarehouse $warehouse, bool $lock = false): string
    {
        $dateCode = now()->format('dmY');
        $prefix = strtoupper($warehouse->code).$dateCode;
        $codes = CnBatch::query()->where('batch_code', 'like', $prefix.'%')
            ->when($lock, fn (Builder $query) => $query->lockForUpdate())
            ->pluck('batch_code')->flip();
        $sequence = $codes->count() + 1;
        while ($codes->has($prefix.$sequence)) {
            $sequence++;
        }

        return $prefix.$sequence;
    }

    private function allowedWarehouses(): ?array
    {
        $actor = Auth::user();
        $assignments = config('cn_warehouse.batch_warehouse_assignments', []);
        if ($actor && array_key_exists($actor->id, $assignments)) {
            return array_map('strval', $assignments[$actor->id]);
        }

        return $actor?->role?->key === 'china_warehouse_partner' ? [] : null;
    }

    private function assertSourceAccess(int|string $warehouseId): void
    {
        $allowed = $this->allowedWarehouses();
        if ($allowed !== null && ! in_array((string) $warehouseId, $allowed, true)) {
            throw new CnPackageInputException('Bạn không có quyền thao tác với lô của kho này.', null, 'CN_BATCH_FORBIDDEN', 403);
        }
    }

    private function packageIssues(CnPackage $package, int|string $warehouseId): array
    {
        $issues = [];
        if ((string) $package->warehouse_id !== (string) $warehouseId) {
            $issues[] = 'Kiện không thuộc kho nguồn của lô';
        }
        if (! $package->received_at) {
            $issues[] = 'Chưa tiếp nhận tại kho Trung Quốc';
        }
        if (blank($package->tracking_number) || $package->status !== 'matched') {
            $issues[] = 'Tracking chưa khớp hợp lệ';
        }
        if ((float) $package->weight <= 0) {
            $issues[] = 'Thiếu khối lượng thực tế';
        }
        if (! ($package->package_items_exists ?? $package->packageItems->contains(fn ($item) => (int) $item->quantity > 0))) {
            $issues[] = 'Chưa xác nhận sản phẩm';
        }

        return $issues;
    }

    private function reviewState(CnBatch $batch, Collection $packages): array
    {
        $issues = [];
        if ($batch->status !== CnBatch::STATUS_PENDING) {
            $issues[] = 'Chỉ lô đang chờ xuất kho mới có thể xác nhận xuất.';
        }
        if ($packages->isEmpty()) {
            $issues[] = 'Lô hàng chưa có kiện để xuất kho.';
        }
        $packages = $packages->sortBy('id')->values();
        $version = hash('sha256', json_encode([
            $batch->id, $batch->warehouse_id, $batch->status, $batch->destination_warehouse_id,
            $batch->destination_warehouse_name, $batch->shipping_type,
            $packages->map(fn (CnPackage $package) => [
                $package->id, $package->warehouse_id, $package->tracking_number, $package->order_id,
                $package->order_tracking_id, $package->weight, $package->status, $package->received_at?->toDateTimeString(),
                $package->package_condition, $package->actual_length, $package->actual_width, $package->actual_height,
                $package->packageItems->sortBy('id')->values()->map(fn ($item) => [$item->id, $item->order_item_id, $item->quantity]),
            ]),
        ], JSON_THROW_ON_ERROR));

        return [
            'version' => $version,
            'issues' => $issues,
            'packages' => $packages->map(fn (CnPackage $package) => [
                'id' => $package->id,
                'issues' => $this->packageIssues($package, $batch->warehouse_id),
                'warnings' => match ($package->package_condition) {
                    'damaged' => ['Vỏ kiện có dấu hiệu hư hỏng. Cần rà soát trước khi xuất.'],
                    'other' => ['Vỏ kiện có ghi chú ngoại lệ. Cần rà soát trước khi xuất.'],
                    default => [],
                },
            ])->all(),
        ];
    }

    private function editableAuditState(CnBatch $batch): array
    {
        return collect($batch->getAttributes())->only(['destination_warehouse_id', 'destination_warehouse_name', 'shipping_type',
            'expected_arrival_at', 'departed_at', 'arrived_at', 'note', 'freight_cost', 'total_weight'])->all() + [
            'packages' => $batch->packages()->orderBy('cn_packages.id')->get()->map(fn (CnPackage $package) =>
                $package->only(['id', 'weight', 'actual_length', 'actual_width', 'actual_height'])
            )->all(),
        ];
    }

    private function audit(CnBatch $batch, string $action, array $before, array $after): void
    {
        AuditLog::query()->create([
            'user_id' => Auth::id(), 'action' => $action,
            'entity_type' => CnBatch::class, 'entity_id' => $batch->id,
            'before_data' => $before, 'after_data' => $after,
            'created_at' => now(),
        ]);
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
                if (! $currentPackageIds->contains((string) $package->id)) {
                    $issues = $this->packageIssues($package, $batch->warehouse_id);
                    if ($package->vnPackages()->exists() || $issues !== []) {
                        throw new CnPackageInputException($package->tracking_number.': '.implode(', ', $issues ?: ['Kiện đã nhập kho Việt Nam']).'.');
                    }
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
