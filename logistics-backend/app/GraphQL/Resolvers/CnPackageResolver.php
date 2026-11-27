<?php

namespace App\GraphQL\Resolvers;

use App\Exceptions\CnPackageInputException;
use App\Models\AuditLog;
use App\Models\CnPackage;
use App\Models\CnPackageItem;
use App\Models\CnWarehouse;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderTracking;
use App\Models\OrderTrackingItem;
use App\Models\User;
use App\Services\Auth\PermissionService;
use App\Services\Warehouses\China\CnPackageTrackingInputPolicy;
use App\Support\BusinessWriteGuard;
use Illuminate\Database\QueryException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CnPackageResolver
{
    public function __construct(
        private readonly PermissionService $permissions,
        private readonly CnPackageTrackingInputPolicy $trackingInputPolicy,
    ) {}

    public function list(): Builder
    {
        return CnPackage::query()
            ->with(['warehouse', 'receiver.role', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem'])
            ->latest('received_at')
            ->latest('id');
    }

    public function show($_, array $args): CnPackage
    {
        return CnPackage::query()
            ->with(['warehouse', 'receiver.role', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem'])
            ->findOrFail($args['id']);
    }

    public function receivingOptions(): array
    {
        $warehouses = CnWarehouse::query()
            ->where('status', 'active')
            ->orderBy('name')
            ->get();

        $receivers = User::query()
            ->select(['id', 'name', 'email', 'phone', 'department', 'status', 'role_id'])
            ->with('role')
            ->where('status', 'active')
            ->whereHas('role')
            ->orderBy('name')
            ->get()
            ->filter(fn (User $user) => $this->isEligibleReceiver($user))
            ->values();

        return ['warehouses' => $warehouses, 'receivers' => $receivers];
    }

    public function create($_, array $args): CnPackage
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);
        $this->assertReceiverSchemaReady();

        return $this->runPackageWrite(function () use ($args) {
            $input = $args['input'];
            $warehouse = $this->resolveWarehouse($input);
            $receiver = $this->resolveReceiver($input['receiver_user_id'] ?? null);
            $trackingNumber = $this->normalizeTrackingNumber($input['tracking_number'] ?? null);

            if ($trackingNumber === null) {
                throw new CnPackageInputException('Vui lòng nhập mã vận đơn thực tế.', 'tracking_number');
            }

            $matchedTracking = $this->matchOrderTracking($trackingNumber, true);
            $weight = array_key_exists('weight', $input) ? $this->normalizeFloat($input['weight']) : null;
            $this->assertTrackingCanBeReceived($trackingNumber, $matchedTracking);
            if ((isset($input['expected_tracking_id']) && (string) $matchedTracking?->id !== (string) $input['expected_tracking_id'])
                || (isset($input['expected_order_id']) && (string) $matchedTracking?->order_id !== (string) $input['expected_order_id'])) {
                throw new CnPackageInputException('Tracking dự kiến đã thay đổi. Vui lòng mở lại danh sách dự kiến.', 'tracking_number');
            }
            if (! $matchedTracking && blank($input['note'] ?? null)) {
                throw new CnPackageInputException('Vui lòng ghi chú thông tin bàn giao hoặc lý do cần đối chiếu.', 'note');
            }
            $receivedAt = $this->validateReceivingMeasurements($weight, $input['received_at'] ?? null);
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
                'receiver_name' => $receiver->name,
                'receiver_user_id' => $receiver->id,
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
                'received_at' => $receivedAt,
            ]);

            $this->refreshOrderTrackingStatus($matchedTracking);
            $this->syncOrderReceivingStatus($package);

            return $package->fresh(['warehouse', 'receiver.role', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem']);
        });
    }

    public function update($_, array $args): CnPackage
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);
        $this->assertReceiverSchemaReady();

        return $this->runPackageWrite(function () use ($args) {
            $package = CnPackage::query()->lockForUpdate()->findOrFail($args['id']);
            $input = $args['input'];

            if (isset($input['reconciliation'])) {
                return $this->reconcile($package, $input['reconciliation']);
            }

            if ($package->batchPackages()->exists()) {
                throw new HttpException(422, 'Package is already assigned to a batch.');
            }

            $warehouse = null;
            $receiver = null;

            if (! empty($input['warehouse_id']) || ! empty($input['warehouse_name']) || ! empty($input['warehouse_code'])) {
                $warehouse = $this->resolveWarehouse($input);
            }

            if (array_key_exists('receiver_user_id', $input)) {
                $receiver = $this->resolveReceiver($input['receiver_user_id']);
            }

            if (array_key_exists('tracking_number', $input)
                && $this->normalizeTrackingNumber($input['tracking_number']) !== $this->normalizeTrackingNumber($package->tracking_number)) {
                throw new CnPackageInputException('Hãy dùng thao tác Đối chiếu để sửa mã vận đơn của kiện chưa khớp.', 'tracking_number');
            }

            $weight = array_key_exists('weight', $input) ? $this->normalizeFloat($input['weight']) : $package->weight;
            $receivedAt = array_key_exists('received_at', $input) ? $input['received_at'] : $package->received_at;
            $receivedAt = $this->validateReceivingMeasurements($weight, $receivedAt);
            $actualLength = array_key_exists('actual_length', $input) ? $this->normalizeFloat($input['actual_length']) : $package->actual_length;
            $actualWidth = array_key_exists('actual_width', $input) ? $this->normalizeFloat($input['actual_width']) : $package->actual_width;
            $actualHeight = array_key_exists('actual_height', $input) ? $this->normalizeFloat($input['actual_height']) : $package->actual_height;
            $volume = $this->calculateVolume($actualLength, $actualWidth, $actualHeight, array_key_exists('volume', $input) ? $input['volume'] : $package->volume);
            $volumetricWeight = $this->calculateVolumetricWeight($actualLength, $actualWidth, $actualHeight, array_key_exists('volumetric_weight', $input) ? $input['volumetric_weight'] : $package->volumetric_weight);
            $chargeableWeight = $this->calculateChargeableWeight($weight, $volumetricWeight, array_key_exists('chargeable_weight', $input) ? $input['chargeable_weight'] : $package->chargeable_weight);

            $package->update([
                'warehouse_id' => $warehouse?->id ?? $package->warehouse_id,
                'receiver_name' => $receiver?->name ?? $package->receiver_name,
                'receiver_user_id' => $receiver?->id ?? $package->receiver_user_id,
                'declared_value' => array_key_exists('declared_value', $input)
                    ? $input['declared_value']
                    : $package->declared_value,
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
                'package_condition' => array_key_exists('package_condition', $input)
                    ? ($this->normalizeOptionalString($input['package_condition']) ?? 'normal')
                    : $package->package_condition,
                'received_at' => $receivedAt,
            ]);

            $this->refreshOrderTrackingStatus($package->orderTracking);
            $this->syncOrderReceivingStatus($package);

            return $package->fresh(['warehouse', 'receiver.role', 'order.customer', 'order.items', 'orderTracking.trackingItems.orderItem', 'currentBatchPackage.batch.warehouse', 'packageItems.orderItem']);
        });
    }

    private function reconcile(CnPackage $package, array $input): CnPackage
    {
        if ($package->status !== 'unmatched' || ! $package->received_at
            || $package->order_id || $package->order_tracking_id
            || $this->normalizeTrackingNumber($package->tracking_number) !== $this->normalizeTrackingNumber($input['original_tracking_number'] ?? null)
            || $package->note !== ($input['original_note'] ?? null)) {
            throw new CnPackageInputException('Kiện đã thay đổi hoặc không còn đủ điều kiện đối chiếu. Vui lòng tải lại danh sách.');
        }

        $reason = $this->normalizeOptionalString($input['reason']);
        if ($reason === null || mb_strlen($reason) > 1000) {
            throw new CnPackageInputException('Vui lòng nhập lý do xác minh (tối đa 1000 ký tự).', 'reason');
        }

        $fields = ['tracking_number', 'order_id', 'order_tracking_id', 'status', 'note'];
        $before = $package->only($fields);
        $changes = [];
        if (array_key_exists('note', $input)) {
            $changes['note'] = $this->normalizeOptionalString($input['note']);
        }

        $tracking = null;
        if (isset($input['verified_tracking_number'])) {
            if ($package->batchPackages()->exists() || $package->packageItems()->exists() || $package->vnPackages()->exists()) {
                throw new CnPackageInputException('Kiện đã có sản phẩm hoặc đã đi vào luồng vận chuyển. Không thể đổi mã hoặc liên kết tại đây.');
            }
            $number = $this->normalizeTrackingNumber($input['verified_tracking_number']);
            $tracking = $this->matchOrderTracking($number, true);
            $this->assertTrackingCanBeReceived($number, $tracking, (int) $package->id);
            $changes['tracking_number'] = $number;
            if ($tracking) {
                $changes += [
                    'order_id' => $tracking->order_id,
                    'order_tracking_id' => $tracking->id,
                    'declared_value' => $tracking->declared_value,
                    'status' => 'matched',
                ];
            }
        }

        $package->update($changes);
        if ($tracking) {
            $this->refreshOrderTrackingStatus($tracking);
            $this->syncOrderReceivingStatus($package);
        }

        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => 'cn_package_reconciled',
            'entity_type' => CnPackage::class,
            'entity_id' => $package->id,
            'before_data' => $before,
            'after_data' => $package->only($fields) + ['reason' => $reason],
            'created_at' => now(),
        ]);

        return $this->show(null, ['id' => $package->id]);
    }

    public function reconciliationOrders($_, array $args): array
    {
        $this->permissions->authorize(Auth::user(), 'orders.read');
        $search = trim($args['search']);
        if ($search === '' || mb_strlen($search) > 191) {
            return [];
        }

        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search).'%';
        return Order::query()
            ->select(['id', 'order_code', 'customer_id'])
            ->with(['customer:id,name', 'orderTrackings:id,order_id,tracking_number', 'taobaoPurchaseOrders:id,order_id,external_order_code,shop_name'])
            ->where(fn (Builder $orders) => $orders
                ->whereRaw("order_code LIKE ? ESCAPE '!'", [$pattern])
                ->orWhereHas('customer', fn (Builder $customers) => $customers->whereRaw("name LIKE ? ESCAPE '!'", [$pattern]))
                ->orWhereHas('orderTrackings', fn (Builder $trackings) => $trackings->whereRaw("tracking_number LIKE ? ESCAPE '!'", [$pattern]))
                ->orWhereHas('taobaoPurchaseOrders', fn (Builder $purchases) => $purchases
                    ->whereRaw("external_order_code LIKE ? ESCAPE '!'", [$pattern])
                    ->orWhereRaw("shop_name LIKE ? ESCAPE '!'", [$pattern])))
            ->latest('id')->limit(12)->get()->map(fn (Order $order) => [
                'id' => $order->id,
                'order_code' => $order->order_code,
                'customer_name' => $order->customer?->name,
                'tracking_numbers' => $order->orderTrackings->pluck('tracking_number')->all(),
                'purchases' => $order->taobaoPurchaseOrders,
            ])->all();
    }

    public function confirmItems($_, array $args): CnPackage
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        $orderId = CnPackage::query()->findOrFail($args['package_id'])->order_id;
        $inspectionNote = $this->normalizeOptionalString($args['inspection_note'] ?? null);
        if ($inspectionNote !== null && mb_strlen($inspectionNote) > 1000) {
            throw new CnPackageInputException('Ghi chú kiểm hàng tối đa 1000 ký tự.', 'inspection_note');
        }

        return DB::transaction(function () use ($args, $orderId, $inspectionNote) {
            // Serialize inspections across different packages of the same order.
            $order = $orderId ? Order::query()->lockForUpdate()->find($orderId) : null;
            $package = CnPackage::query()
                ->lockForUpdate()->findOrFail($args['package_id']);

            if ($package->batchPackages()->exists()) {
                throw new HttpException(422, 'Package is already assigned to a batch.');
            }

            $tracking = $package->orderTracking()->lockForUpdate()->first();
            if (! $order || $package->status !== 'matched' || ! $package->received_at
                || (string) $package->order_id !== (string) $orderId
                || ! $tracking || (string) $tracking->order_id !== (string) $orderId
                || $this->normalizeTrackingNumber($tracking->tracking_number) !== $this->normalizeTrackingNumber($package->tracking_number)) {
                throw new CnPackageInputException('Kiện phải đã tiếp nhận và khớp với đơn VietTrung trước khi kiểm sản phẩm.');
            }

            if (isset($args['expected_items'])) {
                $expected = collect($args['expected_items'])->pluck('quantity', 'order_item_id')->map(fn ($quantity) => (int) $quantity)->sortKeys()->all();
                $current = $package->packageItems()->pluck('quantity', 'order_item_id')->map(fn ($quantity) => (int) $quantity)->sortKeys()->all();
                if ($expected !== $current) {
                    throw new CnPackageInputException('Kết quả kiểm của kiện đã thay đổi. Hãy mở lại cửa sổ kiểm hàng.');
                }
            }

            $orderItems = $order->items()->get()->keyBy(fn (OrderItem $item) => (string) $item->id);
            $selectedItems = collect($args['items'] ?? [])
                ->map(function (array $selection) use ($orderItems) {
                    $orderItemId = (string) ($selection['order_item_id'] ?? '');
                    $orderItem = $orderItems->get($orderItemId);

                    if (! $orderItem) {
                        throw new CnPackageInputException('Sản phẩm đã chọn không thuộc đơn VietTrung của kiện.');
                    }

                    $quantity = max(0, (int) ($selection['quantity'] ?? 0));

                    if ($quantity <= 0) {
                        throw new CnPackageInputException('Số lượng kiểm phải lớn hơn 0.');
                    }

                    return [
                        'order_item' => $orderItem,
                        'quantity' => $quantity,
                    ];
                })
                ->values();

            if ($selectedItems->isEmpty() && $inspectionNote === null) {
                throw new CnPackageInputException('Chọn sản phẩm đã kiểm hoặc nhập ghi chú ngoại lệ.');
            }

            if ($selectedItems->pluck('order_item.id')->duplicates()->isNotEmpty()) {
                throw new CnPackageInputException('Một sản phẩm chỉ được xác nhận một lần trong mỗi kiện.');
            }

            $otherTotals = CnPackageItem::query()
                ->whereIn('order_item_id', $selectedItems->pluck('order_item.id'))
                ->where('cn_package_id', '<>', $package->id)
                ->groupBy('order_item_id')->selectRaw('order_item_id, SUM(quantity) AS quantity')
                ->pluck('quantity', 'order_item_id');

            foreach ($selectedItems as $selection) {
                $item = $selection['order_item'];
                $remaining = max(0, (int) $item->quantity - (int) $otherTotals->get($item->id, 0));
                if ($selection['quantity'] > $remaining) {
                    throw new CnPackageInputException("SKU #{$item->id} chỉ còn {$remaining} đơn vị có thể xác nhận. Hãy ghi số lượng thừa vào ghi chú ngoại lệ.", 'items');
                }
            }

            if ($inspectionNote !== null) {
                AuditLog::create([
                    'user_id' => Auth::id(),
                    'action' => 'cn_package_inspection_exception',
                    'entity_type' => CnPackage::class,
                    'entity_id' => $package->id,
                    'after_data' => ['note' => $inspectionNote],
                    'created_at' => now(),
                ]);
            }
            if ($selectedItems->isEmpty()) {
                return $this->show(null, ['id' => $package->id]);
            }
            $preserveUnselected = $args['preserve_unselected'] ?? false;
            if (! $preserveUnselected) {
                $package->packageItems()->delete();
            }

            foreach ($selectedItems as $selection) {
                $package->packageItems()->updateOrCreate(
                    ['order_item_id' => $selection['order_item']->id],
                    ['quantity' => $selection['quantity']],
                );
            }

            $this->syncTrackingItemsFromPackages(
                $tracking,
                $preserveUnselected ? $selectedItems->pluck('order_item.id')->all() : null,
            );
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
        }, 3);
    }

    public function delete($_, array $args): CnPackage
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

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
        if (empty($input['warehouse_id'])) {
            throw new CnPackageInputException('Vui lòng chọn kho Trung Quốc đang hoạt động.', 'warehouse_id');
        }

        $warehouse = CnWarehouse::query()
            ->where('status', 'active')
            ->find($input['warehouse_id']);

        if (! $warehouse) {
            throw new CnPackageInputException('Kho Trung Quốc không tồn tại hoặc đã ngừng hoạt động.', 'warehouse_id');
        }

        return $warehouse;
    }

    private function assertReceiverSchemaReady(): void
    {
        if (! Schema::hasColumn('cn_packages', 'receiver_user_id')) {
            throw new CnPackageInputException(
                'Cấu hình dữ liệu người nhận kho Trung Quốc chưa hoàn tất. Vui lòng liên hệ quản trị viên.',
                null,
                'CN_PACKAGE_SCHEMA_NOT_READY',
                503,
            );
        }
    }

    private function runPackageWrite(callable $callback): CnPackage
    {
        try {
            return DB::transaction($callback, 3);
        } catch (QueryException $exception) {
            $sqlState = (string) ($exception->errorInfo[0] ?? '');
            $driverCode = (int) ($exception->errorInfo[1] ?? 0);

            if (
                $sqlState === '23000'
                && $driverCode === 1062
                && str_contains(strtolower($exception->getMessage()), 'tracking_number')
            ) {
                throw new CnPackageInputException(
                    'Mã vận đơn đã tồn tại trong kho Trung Quốc.',
                    'tracking_number',
                    'CN_PACKAGE_DUPLICATE_TRACKING',
                    409,
                );
            }

            throw $exception;
        }
    }

    private function assertTrackingCanBeReceived(
        string $trackingNumber,
        ?OrderTracking $matchedTracking,
        ?int $ignorePackageId = null,
    ): void {
        $validation = $this->trackingInputValidationState($trackingNumber, $matchedTracking, $ignorePackageId);

        if (! $validation['valid']) {
            throw new CnPackageInputException(
                $validation['message'],
                'tracking_number',
                $validation['code'],
                $validation['code'] === 'CN_PACKAGE_DUPLICATE_TRACKING' ? 409 : 422,
            );
        }
    }

    private function validateReceivingMeasurements(?float $weight, mixed $receivedAt): Carbon
    {
        if ($weight === null || $weight <= 0) {
            throw new CnPackageInputException('Khối lượng thực tế phải lớn hơn 0.', 'weight');
        }

        if (blank($receivedAt)) {
            throw new CnPackageInputException('Vui lòng nhập thời gian nhận hàng.', 'received_at');
        }

        $receivedAtUtc = Carbon::parse($receivedAt, 'UTC')->utc();
        if ($receivedAtUtc->isAfter(Carbon::now('UTC'))) {
            throw new CnPackageInputException('Thời gian nhận hàng không được ở tương lai.', 'received_at');
        }

        return $receivedAtUtc;
    }

    private function resolveReceiver(mixed $receiverUserId): User
    {
        if (blank($receiverUserId)) {
            throw new CnPackageInputException('Vui lòng chọn người nhận hàng hợp lệ.', 'receiver_user_id');
        }

        $receiver = User::query()->with('role')->find($receiverUserId);

        if (! $receiver || ! $this->isEligibleReceiver($receiver)) {
            throw new CnPackageInputException(
                'Nhân viên nhận hàng không còn hoạt động hoặc không có quyền tại kho Trung Quốc.',
                'receiver_user_id',
            );
        }

        return $receiver;
    }

    private function isEligibleReceiver(User $user): bool
    {
        if ($user->status !== 'active' || ! $this->permissions->allows($user, 'cn_packages.create')) {
            return false;
        }

        $permissions = $user->role?->permissions ?? [];

        return $user->department === 'china_warehouse' || in_array('all', $permissions, true);
    }

    private function matchOrderTracking(?string $trackingNumber, bool $lock = false): ?OrderTracking
    {
        if ($trackingNumber === null) {
            return null;
        }

        return OrderTracking::query()
            ->where('tracking_number', $trackingNumber)
            ->when($lock, fn (Builder $query) => $query->lockForUpdate())
            ->first();
    }

    public function trackingInputValidation($_, array $args): array
    {
        $trackingNumber = $this->normalizeTrackingNumber($args['tracking_number'] ?? null);

        $matchedTracking = $this->matchOrderTracking($trackingNumber);
        $ignorePackageId = isset($args['ignore_package_id']) ? (int) $args['ignore_package_id'] : null;
        $result = $this->trackingInputValidationState($trackingNumber, $matchedTracking, $ignorePackageId);
        if ($result['valid'] && $matchedTracking && $this->permissions->allows(Auth::user(), 'orders.read')) {
            $result['order_code'] = $matchedTracking->order()->value('order_code');
            $result['purchase_orders'] = $matchedTracking->taobaoPurchaseOrders()
                ->get(['taobao_purchase_orders.id', 'external_order_code', 'shop_name']);
        }

        return $result;
    }

    private function trackingInputValidationState(
        ?string $trackingNumber,
        ?OrderTracking $matchedTracking,
        ?int $ignorePackageId = null,
    ): array {
        if ($trackingNumber === null) {
            return $this->trackingInputPolicy->evaluate(null, false, false, false);
        }
        if (mb_strlen($trackingNumber) > 100) {
            return ['valid' => false, 'matched' => false, 'message' => 'Mã vận đơn tối đa 100 ký tự.', 'code' => 'CN_PACKAGE_TRACKING_TOO_LONG'];
        }

        $duplicate = CnPackage::query()->where(fn (Builder $query) => $query
            ->where('tracking_number', $trackingNumber)
            ->orWhereRaw('UPPER(TRIM(tracking_number)) = ?', [$trackingNumber]));

        if ($ignorePackageId !== null) {
            $duplicate->where('id', '!=', $ignorePackageId);
        }

        $existingId = $duplicate->value('id');
        $state = $this->trackingInputPolicy->evaluate(
            $trackingNumber,
            $matchedTracking !== null,
            $matchedTracking === null && Order::query()->where('order_code', $trackingNumber)->exists(),
            $existingId !== null,
        );
        $state['existing_package_id'] = $existingId;
        if (! $state['valid']) {
            return $state;
        }

        $conflicting = $matchedTracking
            ? ($matchedTracking->packages()->exists()
                || $matchedTracking->taobaoPurchaseOrders()->where('taobao_purchase_orders.order_id', '<>', $matchedTracking->order_id)->exists())
            : OrderTracking::query()->whereRaw('UPPER(TRIM(tracking_number)) = ?', [$trackingNumber])->exists();

        if ($conflicting || ($matchedTracking && strtoupper(trim($matchedTracking->tracking_number)) !== $trackingNumber)) {
            return [
                'valid' => false,
                'matched' => false,
                'message' => 'Mã vận đơn có dữ liệu mâu thuẫn. Vui lòng đối chiếu trước khi tiếp nhận.',
                'code' => 'CN_PACKAGE_TRACKING_CONFLICT',
            ];
        }

        return $state;
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

    private function syncTrackingItemsFromPackages(OrderTracking $tracking, ?array $changedItemIds = null): void
    {
        $tracking->loadMissing('packages.packageItems.orderItem');
        $aggregated = [];

        foreach ($tracking->packages as $package) {
            foreach ($package->packageItems as $packageItem) {
                $orderItemId = (string) $packageItem->order_item_id;
                $aggregated[$orderItemId] = ($aggregated[$orderItemId] ?? 0) + (int) $packageItem->quantity;
            }
        }

        if ($changedItemIds === null) {
            $tracking->trackingItems()->delete();
        } else {
            $aggregated = array_intersect_key($aggregated, array_flip($changedItemIds));
        }

        foreach ($aggregated as $orderItemId => $quantity) {
            $tracking->trackingItems()->updateOrCreate(
                ['order_item_id' => $orderItemId],
                ['quantity' => $quantity],
            );
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
