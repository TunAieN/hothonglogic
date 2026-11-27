<?php

namespace App\GraphQL\Resolvers;

use App\Models\CnPackage;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderTracking;
use App\Models\OrderTrackingItem;
use App\Models\TaobaoPurchaseOrder;
use App\Services\Orders\OrderPricingService;
use App\Services\Orders\OrderDepositPolicyService;
use App\Services\Payments\PaymentVoucherService;
use App\Support\BusinessWriteGuard;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OrderResolver
{
    public function __construct(
        private readonly OrderPricingService $pricingService,
        private readonly PaymentVoucherService $paymentVoucherService,
        private readonly OrderDepositPolicyService $depositPolicyService,
    ) {}

    public function list($_, array $args): Builder
    {
        $filter = $args['filter'] ?? [];

        return Order::query()
            ->with($this->orderRelations())
            ->when($this->filled($filter, 'search'), function (Builder $query) use ($filter) {
                $search = trim((string) $filter['search']);

                $query->where(function (Builder $nestedQuery) use ($search) {
                    $nestedQuery
                        ->where('order_code', 'like', '%'.$search.'%')
                        ->orWhere('status', 'like', '%'.$search.'%')
                        ->orWhereHas('customer', function (Builder $customerQuery) use ($search) {
                            $customerQuery
                                ->where('name', 'like', '%'.$search.'%')
                                ->orWhere('email', 'like', '%'.$search.'%')
                                ->orWhere('phone', 'like', '%'.$search.'%')
                                ->orWhere('address', 'like', '%'.$search.'%');
                        })
                        ->orWhereHas('creator', function (Builder $creatorQuery) use ($search) {
                            $creatorQuery->where('name', 'like', '%'.$search.'%');
                        });
                });
            })
            ->when($this->filled($filter, 'customer_id'), fn (Builder $query) => $query->where(
                'customer_id',
                $filter['customer_id'],
            ))
            ->when($this->filled($filter, 'created_by'), fn (Builder $query) => $query->where(
                'created_by',
                $filter['created_by'],
            ))
            ->when($this->filled($filter, 'order_code'), function (Builder $query) use ($filter) {
                $query->where('order_code', 'like', '%'.trim((string) $filter['order_code']).'%');
            })
            ->when($this->filled($filter, 'status'), fn (Builder $query) => $query->where(
                'status',
                $filter['status'],
            ))
            ->when($this->filled($filter, 'created_from'), fn (Builder $query) => $query->where(
                'created_at',
                '>=',
                $filter['created_from'],
            ))
            ->when($this->filled($filter, 'created_to'), fn (Builder $query) => $query->where(
                'created_at',
                '<=',
                $filter['created_to'],
            ))
            ->latest('created_at')
            ->latest('id');
    }

    public function create($_, array $args)
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        if (! Auth::check()) {
            throw new \Exception('Unauthenticated. Please login to create an order.');
        }

        return DB::transaction(function () use ($args) {
            $input = $args['input'];

            $orderAttributes = [
                'order_code' => 'ORD-'.date('Ymd').'-'.strtoupper(substr(uniqid(), -6)),
                'customer_id' => $input['customer_id'],
                'total_amount' => 0,
                'product_total_cny' => 0,
                'product_total_vnd' => 0,
                'currency' => 'CNY',
                'note' => $input['note'] ?? null,
                'status' => 'pending',
                'created_by' => Auth::id(),
            ];
            if (Schema::hasColumn('orders', 'creation_source')) {
                $orderAttributes['creation_source'] = Order::SOURCE_ADMIN_PORTAL;
            }
            $order = Order::create($orderAttributes);

            foreach ($input['items'] as $item) {
                $createdItem = $order->items()->create($this->normalizeOrderItemPayload($item));
                $this->pricingService->recalculateOrderItemAmounts($createdItem);
            }

            $freshOrder = $this->pricingService->recalculateOrderTotals($order->fresh('items'));

            if (array_key_exists('packages', $input) && is_array($input['packages'])) {
                $this->syncOrderTrackings($freshOrder->fresh('items'), $input['packages']);
            }

            return $freshOrder->fresh()->load($this->orderRelations());
        });
    }

    public function update($_, array $args)
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($args) {
            $order = Order::query()->lockForUpdate()->findOrFail($args['id']);
            $input = $args['input'];

            $nextItems = null;

            if (array_key_exists('items', $input) && is_array($input['items'])) {
                $nextItems = $input['items'];
            }

            if ($nextItems !== null && $order->exchange_rate_locked_at) {
                throw new HttpException(403, 'Đơn hàng đã chốt tỷ giá. Không thể sửa sản phẩm trong luồng hiện tại.');
            }

            if (! $this->canUpdateOrder($order, $input)) {
                throw new HttpException(403, 'Không thể cập nhật đơn hàng với trạng thái hoặc dữ liệu yêu cầu.');
            }

            if ($nextItems !== null && array_key_exists('packages', $input)) {
                throw new HttpException(422, 'Cannot sync trackings while replacing order items in the same request.');
            }

            $currentStatus = (string) $order->status;
            $nextStatus = $input['status'] ?? $order->status;

            if ($currentStatus === 'purchasing' && in_array($nextStatus, ['awaiting_tracking', 'waiting_cn_warehouse'], true) && Schema::hasTable('taobao_purchase_orders')) {
                throw new HttpException(422, 'Hãy dùng luồng Xác nhận đã đặt hàng Taobao để kiểm tra đủ số lượng trước khi chuyển trạng thái.');
            }

            if ($nextStatus === 'deposited' && (int) ($order->deposit_remaining_amount_vnd ?? 0) > 0) {
                throw new HttpException(422, 'Chua the xac nhan da dat coc khi so tien coc chua thanh toan du.');
            }

            if ($nextStatus === 'awaiting_deposit' && ($currentStatus !== 'awaiting_deposit' || (int) ($order->deposit_amount_vnd ?? 0) <= 0)) {
                $order = $this->createDepositRequest($order, $input);
            } elseif ($currentStatus === 'pending' && $nextStatus === 'purchasing') {
                $lockedOrder = $order->exchange_rate_locked_at ? $order->fresh('items') : $this->pricingService->lockExchangeRateForOrder($order);
                if (Schema::hasTable('order_deposit_policy_snapshots')) {
                    $this->depositPolicyService->assess($lockedOrder, [...$input, 'waive_deposit' => true]);
                }
                $order = $lockedOrder;
            }

            $order->update([
                'customer_id' => $input['customer_id'] ?? $order->customer_id,
                'status' => $nextStatus,
                'note' => $input['note'] ?? $order->note,
                'account_manager_id' => $input['account_manager_id'] ?? $order->account_manager_id,
            ]);

            if ((string) $nextStatus === 'awaiting_deposit') {
                // Keep the status/snapshot and its payment voucher in one transaction.
                // The service is idempotent, so the UI's legacy second mutation is safe.
                $this->paymentVoucherService->createDepositVoucher(
                    $order->id,
                    $input['deposit_percent'] ?? $order->deposit_percent,
                    false,
                );
                $this->depositPolicyService->markVoucherIssued($order);
            }

            if ($nextItems !== null) {
                $order->items()->delete();

                foreach ($nextItems as $item) {
                    $createdItem = $order->items()->create($this->normalizeOrderItemPayload($item));
                    $this->pricingService->recalculateOrderItemAmounts($createdItem, $order->exchange_rate);
                }
            }

            $freshOrder = $order->fresh('items');
            if ($nextItems !== null) {
                $freshOrder = $this->pricingService->recalculateOrderTotals($freshOrder, $freshOrder->exchange_rate);
            }

            if (! $order->exchange_rate_locked_at && $this->shouldLockExchangeRate($currentStatus, (string) $nextStatus)) {
                $freshOrder = $this->pricingService->lockExchangeRateForOrder($order);
            }

            if (array_key_exists('packages', $input) && is_array($input['packages'])) {
                $this->syncOrderTrackings($freshOrder->fresh('items'), $input['packages']);
            }

            return $freshOrder->fresh()->load($this->orderRelations());
        });
    }

    public function confirmDepositPayment($_, array $args): Order
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return $this->paymentVoucherService->confirmDepositPayment($args['order_id'], $args['input'] ?? [])
            ->load($this->orderRelations());
    }

    public function delete($_, array $args): Order
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($args) {
            $order = Order::query()
                ->with($this->orderRelations())
                ->findOrFail($args['id']);

            $deletedOrder = $order->replicate();
            $deletedOrder->setAttribute('id', $order->id);
            $deletedOrder->setRelation('items', $order->items);
            $deletedOrder->setRelation('customer', $order->customer);
            $deletedOrder->setRelation('creator', $order->creator);
            $deletedOrder->setRelation('cnPackages', $order->cnPackages);
            $deletedOrder->setRelation('orderTrackings', $order->orderTrackings);

            $order->items()->delete();
            $order->delete();

            return $deletedOrder;
        });
    }

    public function mockReceiveAtGuangzhouWarehouse($_, array $args): array
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($args) {
            $package = CnPackage::query()
                ->with(['warehouse', 'order.items', 'order.customer', 'order.creator', 'orderTracking.trackingItems.orderItem'])
                ->findOrFail($args['package_id']);

            $order = $package->order;

            if (! $order) {
                throw new HttpException(422, 'Package is not linked to any order.');
            }

            if (! $this->isOrderEditable($order)) {
                throw new HttpException(403, 'Order is not editable in its current status.');
            }

            $tracking = $package->orderTracking;

            if (! $tracking || $tracking->trackingItems->isEmpty()) {
                throw new HttpException(422, 'Order tracking must contain at least one order item.');
            }

            $package->update([
                'tracking_number' => $package->tracking_number ?: $tracking->tracking_number,
                'declared_value' => $tracking->declared_value ?? $this->calculateDeclaredValue($tracking->trackingItems),
                'carrier' => $package->carrier ?: ($tracking->carrier ?: 'VN Express'),
                'status' => 'matched',
                'received_at' => $package->received_at ?? now(),
                'note' => 'Mock warehouse receive for development testing',
            ]);

            $tracking->update(['status' => 'received']);

            return [
                'order' => $order->fresh()->load($this->orderRelations()),
                'package' => $package->fresh()->load(['warehouse', 'order.customer', 'order.creator', 'orderTracking.trackingItems.orderItem']),
            ];
        });
    }

    public function createPackagesByShop($_, array $args): Order
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($args) {
            $order = Order::query()
                ->with(['items', 'customer', 'creator', 'orderTrackings.trackingItems'])
                ->findOrFail($args['order_id']);

            if (! $this->isOrderEditable($order)) {
                throw new HttpException(403, 'Order is not editable in its current status.');
            }

            $order->orderTrackings()->delete();

            $groupedItems = $order->items->groupBy(function (OrderItem $item) {
                return $this->resolvePackageGroupingKey($item);
            })->values();

            foreach ($groupedItems as $index => $items) {
                $trackingNumber = sprintf('PENDING-%s-%02d', $order->id, $index + 1);
                $declaredValue = $items->reduce(
                    fn (string $sum, OrderItem $item) => $this->pricingService->addCny($sum, $this->pricingService->multiplyCnyByQuantity((string) $item->price_cny, (int) $item->quantity)),
                    '0.00',
                );

                $tracking = OrderTracking::query()->create([
                    'order_id' => $order->id,
                    'tracking_number' => $trackingNumber,
                    'carrier' => 'VN Express',
                    'declared_value' => $declaredValue,
                    'note' => 'Auto generated pending tracking by shop for development testing',
                    'status' => 'pending',
                ]);

                foreach ($items as $item) {
                    OrderTrackingItem::query()->create([
                        'order_tracking_id' => $tracking->id,
                        'order_item_id' => $item->id,
                        'quantity' => max(1, (int) $item->quantity),
                    ]);
                }
            }

            return $order->fresh()->load($this->orderRelations());
        });
    }

    private function shouldLockExchangeRate(string $currentStatus, string $nextStatus): bool
    {
        $currentStatus = strtolower($currentStatus);
        $nextStatus = strtolower($nextStatus);

        return $currentStatus !== $nextStatus && in_array($nextStatus, ['purchasing', 'awaiting_tracking', 'waiting_cn_warehouse'], true);
    }

    private function isOrderEditable(Order $order): bool
    {
        return strtolower((string) $order->status) === 'pending';
    }

    private function createDepositRequest(Order $order, array $input): Order
    {
        $lockedOrder = $order->exchange_rate_locked_at ? $order->fresh('items') : $this->pricingService->lockExchangeRateForOrder($order);
        $baseAmountVnd = (int) ($lockedOrder->product_total_vnd ?? 0);
        if ($baseAmountVnd <= 0 || ! $lockedOrder->exchange_rate_locked_at) {
            throw new HttpException(422, 'Chua the tao yeu cau dat coc vi chua xac dinh duoc so tien VND.');
        }

        $percent = Schema::hasTable('order_deposit_policy_snapshots')
            ? (float) $this->depositPolicyService->assess($lockedOrder, $input)->final_percent
            : round((float) ($input['deposit_percent'] ?? 70), 2);
        if ($percent <= 0 || $percent > 100) {
            throw new HttpException(422, 'Tỷ lệ đặt cọc phải lớn hơn 0 và không vượt quá 100%.');
        }
        $depositAmount = (int) round($baseAmountVnd * $percent / 100);
        if ($depositAmount <= 0) {
            throw new HttpException(422, 'So tien dat coc phai lon hon 0.');
        }

        $lockedOrder->forceFill([
            'deposit_percent' => $percent,
            'deposit_amount_vnd' => $depositAmount,
            'deposit_paid_amount_vnd' => 0,
            'deposit_remaining_amount_vnd' => $depositAmount,
            'deposit_status' => 'waiting_payment',
            'deposit_transfer_content' => 'COC '.$lockedOrder->order_code,
            'deposit_requested_at' => now(),
        ])->save();

        return $lockedOrder->fresh('items');
    }

    public function depositPolicyPreview($_, array $args): array
    {
        $order = Order::query()
            ->with(['items', 'customer.vipTier'])
            ->findOrFail($args['order_id']);

        return $this->depositPolicyService->preview($order, $args['risk_level'] ?? null);
    }

    private function parseDateTime(mixed $value): ?Carbon
    {
        if (! $value) {
            return null;
        }
        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    private function canUpdateOrder(Order $order, array $input): bool
    {
        if ($this->isOrderEditable($order)) {
            return true;
        }

        if ($this->isStatusOnlyTransitionAllowed($order, $input)) {
            return true;
        }

        return $this->canManageOrderTrackings($order, $input);
    }

    private function isStatusOnlyTransitionAllowed(Order $order, array $input): bool
    {
        if (! array_key_exists('status', $input)) {
            return false;
        }

        $nonStatusFields = array_values(array_diff(array_keys($input), ['status']));
        $nextStatus = strtolower(trim((string) $input['status']));

        $confirmationFields = ['deposit_percent', 'risk_level', 'risk_reason', 'risk_evidence', 'waive_deposit', 'exception_reason'];
        if ($nonStatusFields !== [] && ! in_array($nextStatus, ['awaiting_deposit', 'purchasing'], true)) {
            return false;
        }
        if (array_diff($nonStatusFields, $confirmationFields) !== []) {
            return false;
        }

        $currentStatus = strtolower((string) $order->status);
        if ($currentStatus === $nextStatus) {
            return true;
        }

        $allowedTransitions = [
            'pending' => ['awaiting_deposit', 'purchasing', 'awaiting_tracking', 'waiting_cn_warehouse'],
            'awaiting_deposit' => ['deposited', 'purchasing', 'awaiting_tracking', 'waiting_cn_warehouse'],
            'deposited' => ['purchasing', 'awaiting_tracking', 'waiting_cn_warehouse'],
            'purchasing' => ['awaiting_tracking', 'waiting_cn_warehouse'],
            'awaiting_tracking' => ['waiting_cn_warehouse'],
            'waiting_cn_warehouse' => ['receiving'],
        ];

        return in_array($nextStatus, $allowedTransitions[$currentStatus] ?? [], true);
    }

    private function canManageOrderTrackings(Order $order, array $input): bool
    {
        $currentStatus = strtolower((string) $order->status);

        if (! in_array($currentStatus, ['awaiting_tracking', 'waiting_cn_warehouse'], true)) {
            return false;
        }

        if (! array_key_exists('packages', $input) || ! is_array($input['packages'])) {
            return false;
        }

        $nonTrackingFields = array_diff(array_keys($input), ['packages', 'status']);

        if ($nonTrackingFields !== []) {
            return false;
        }

        if (! array_key_exists('status', $input)) {
            return true;
        }

        return $this->isStatusOnlyTransitionAllowed($order, ['status' => $input['status']]);
    }

    private function normalizeOrderItemPayload(array $item): array
    {
        $seller = $this->normalizeOptionalString($item['seller'] ?? null);
        $shopId = $this->normalizeOptionalString($item['shop_id'] ?? null);
        $shopName = $this->normalizeOptionalString($item['shop_name'] ?? null);

        return [
            ...$item,
            'seller' => $seller,
            'shop_id' => $shopId,
            'shop_name' => $shopName ?? $seller,
        ];
    }

    private function calculateDeclaredValue($trackingItems): string
    {
        return collect($trackingItems)->reduce(function (string $sum, OrderTrackingItem $trackingItem) {
            return $this->pricingService->addCny(
                $sum,
                $this->pricingService->multiplyCnyByQuantity((string) ($trackingItem->orderItem?->price_cny ?? 0), (int) ($trackingItem->quantity ?? 0)),
            );
        }, '0.00');
    }

    private function resolvePackageGroupingKey(OrderItem $item): string
    {
        $shopId = $this->normalizeOptionalString($item->shop_id);
        $shopName = $this->normalizeOptionalString($item->shop_name);
        $seller = $this->normalizeOptionalString($item->seller);

        if ($shopId !== null) {
            return 'shop-id:'.$shopId;
        }

        if ($shopName !== null) {
            return 'shop-name:'.mb_strtolower($shopName);
        }

        if ($seller !== null) {
            return 'seller:'.mb_strtolower($seller);
        }

        return 'unknown-seller';
    }

    private function syncOrderTrackings(Order $order, array $trackingsInput): void
    {
        $orderItems = $order->items()->get()->keyBy(fn (OrderItem $item) => (string) $item->id);
        $existingTrackingsCollection = $order->orderTrackings()
            ->with(['trackingItems', 'packages' => fn ($packages) => $packages->lockForUpdate()])
            ->lockForUpdate()
            ->get();
        $existingTrackings = $existingTrackingsCollection
            ->keyBy(fn (OrderTracking $tracking) => (string) $tracking->id);
        $trackingPayloads = collect($trackingsInput)
            ->values()
            ->map(fn (array $trackingInput) => $this->normalizeTrackingPayload($trackingInput, $orderItems));

        $this->assertTrackingNumbersUniqueWithinOrder($trackingPayloads);
        if ($trackingPayloads->contains('has_tracking_items', true)) {
            $effectiveAllocations = $trackingPayloads->map(function (array $payload) use ($existingTrackings, $orderItems) {
                $tracking = $existingTrackings->get($payload['id']);
                $hasWarehouseReceipt = $tracking?->packages->contains(fn (CnPackage $package) => $package->received_at !== null) ?? false;
                if ($tracking && (! $payload['has_tracking_items'] || $hasWarehouseReceipt)) {
                    $payload['package_items'] = $tracking->trackingItems->map(fn (OrderTrackingItem $item) => [
                        'order_item' => $orderItems->get((string) $item->order_item_id),
                        'quantity' => (int) $item->quantity,
                    ])->filter(fn (array $item) => $item['order_item'] !== null);
                }

                return $payload;
            });
            $this->assertTrackingQuantitiesWithinOrderLimits($effectiveAllocations, $orderItems);
        }

        $keepTrackingIds = [];

        foreach ($trackingPayloads as $payload) {
            $selectedItems = $payload['package_items'];
            $tracking = null;

            if ($payload['id'] !== null) {
                $tracking = $existingTrackings->get($payload['id']);
            }

            if ($payload['id'] !== null && ! $tracking) {
                throw new HttpException(422, 'Tracking does not belong to this order.');
            }

            $keepWarehouseEvidence = $tracking?->packages->contains(fn (CnPackage $package) => $package->received_at !== null) ?? false;
            if ($keepWarehouseEvidence) {
                if (strtoupper(trim($tracking->tracking_number)) !== $payload['tracking_number']) {
                    throw new HttpException(422, 'Không thể đổi mã vận đơn đã được kho tiếp nhận.');
                }
                if ($payload['taobao_purchase_order_ids'] !== null) {
                    $before = $tracking->taobaoPurchaseOrders()->pluck('taobao_purchase_orders.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
                    $requested = collect($payload['taobao_purchase_order_ids'])->unique()->sort()->values()->all();
                    if ($before !== $requested) {
                        throw new HttpException(422, 'Dùng thao tác Xác minh đơn Taobao tại Kho Trung Quốc cho vận đơn đã tiếp nhận.');
                    }
                }
                $keepTrackingIds[] = (string) $tracking->id;
                $tracking->update([
                    'carrier' => $payload['carrier'] ?? $tracking->carrier,
                    'dispatched_at' => $payload['dispatched_at'],
                    'note' => $payload['note'],
                ]);
                continue;
            }

            $replaceTrackingItems = ! $tracking || $payload['has_tracking_items'];
            $declaredValue = $replaceTrackingItems
                ? $this->calculateDeclaredValueFromSelections($selectedItems)
                : $tracking->declared_value;

            $duplicateTracking = OrderTracking::query()
                ->where('tracking_number', $payload['tracking_number'])
                ->when(
                    $tracking,
                    fn (Builder $query) => $query->where('id', '!=', $tracking->id),
                )
                ->first();

            if ($duplicateTracking) {
                $message = (string) $duplicateTracking->order_id === (string) $order->id
                    ? sprintf('Tracking number "%s" already exists in this order.', $payload['tracking_number'])
                    : sprintf('Tracking number "%s" already exists in another order.', $payload['tracking_number']);

                throw new HttpException(422, $message);
            }

            $trackingAttributes = [
                'order_id' => $order->id,
                'tracking_number' => $payload['tracking_number'],
                'declared_value' => $declaredValue,
                'carrier' => $payload['carrier'] ?? 'VN Express',
                'dispatched_at' => $payload['dispatched_at'],
                'note' => $payload['note'],
                'status' => $tracking ? $tracking->status : 'pending',
            ];

            if ($tracking) {
                $tracking->update($trackingAttributes);
            } else {
                $tracking = OrderTracking::query()->create($trackingAttributes);
            }

            $keepTrackingIds[] = (string) $tracking->id;

            if ($replaceTrackingItems) {
                $tracking->trackingItems()->delete();
                foreach ($selectedItems as $selection) {
                    OrderTrackingItem::query()->create([
                        'order_tracking_id' => $tracking->id,
                        'order_item_id' => $selection['order_item']->id,
                        'quantity' => $selection['quantity'],
                    ]);
                }
            }

            $this->reconcilePackagesWithTracking($tracking);

            if ($payload['taobao_purchase_order_ids'] !== null) {
                $purchaseIds = collect($payload['taobao_purchase_order_ids'])->unique()->values();
                $validCount = TaobaoPurchaseOrder::query()->where('order_id', $order->id)->whereIn('id', $purchaseIds)->count();
                if ($validCount !== $purchaseIds->count()) {
                    throw new HttpException(422, 'Đơn mua Taobao liên kết vận đơn không thuộc đơn VietTrung này.');
                }
                $beforePurchaseIds = $tracking->taobaoPurchaseOrders()->pluck('taobao_purchase_orders.id')->map(fn ($id) => (string) $id)->sort()->values()->all();
                $tracking->taobaoPurchaseOrders()->syncWithPivotValues($purchaseIds->all(), ['linked_by' => Auth::id()]);
                $afterPurchaseIds = $purchaseIds->map(fn ($id) => (string) $id)->sort()->values()->all();
                if ($beforePurchaseIds !== $afterPurchaseIds) {
                    AuditLog::create([
                        'user_id' => Auth::id(), 'action' => 'taobao_purchase_tracking_links_updated',
                        'entity_type' => OrderTracking::class, 'entity_id' => (string) $tracking->id,
                        'before_data' => ['taobao_purchase_order_ids' => $beforePurchaseIds],
                        'after_data' => ['taobao_purchase_order_ids' => $afterPurchaseIds],
                        'ip' => request()?->ip(), 'user_agent' => request()?->userAgent(), 'created_at' => now(),
                    ]);
                }
            }
        }

        $trackingsToDelete = $order->orderTrackings()
            ->whereNotIn('id', $keepTrackingIds === [] ? [-1] : $keepTrackingIds)
            ->get();

        foreach ($trackingsToDelete as $tracking) {
            if ($tracking->packages()->whereNotNull('received_at')->lockForUpdate()->first(['id'])) {
                throw new HttpException(422, sprintf('Không thể xóa mã vận đơn "%s" đã được kho tiếp nhận.', $tracking->tracking_number));
            }
            if (Schema::hasTable('taobao_purchase_order_trackings') && $tracking->taobaoPurchaseOrders()->exists()) {
                throw new HttpException(422, sprintf('Không thể xóa mã vận đơn "%s" vì đã liên kết với đơn mua Taobao.', $tracking->tracking_number));
            }
            CnPackage::query()
                ->where('order_tracking_id', $tracking->id)
                ->update([
                    'order_tracking_id' => null,
                    'order_id' => null,
                    'status' => 'unmatched',
                ]);

            $tracking->delete();
        }
    }

    private function normalizeTrackingPayload(array $trackingInput, $orderItems): array
    {
        $selectedItems = collect($trackingInput['tracking_items'] ?? $trackingInput['package_items'] ?? [])
            ->map(function (array $selection) use ($orderItems) {
                $orderItemId = (string) ($selection['order_item_id'] ?? '');
                $orderItem = $orderItems->get($orderItemId);

                if (! $orderItem) {
                    throw new HttpException(422, 'Selected tracking item does not belong to this order.');
                }

                $quantity = max(0, (int) ($selection['quantity'] ?? 0));

                if ($quantity <= 0) {
                    throw new HttpException(422, 'Tracking item quantity must be greater than 0.');
                }

                return [
                    'order_item' => $orderItem,
                    'quantity' => $quantity,
                ];
            })
            ->values();

        $trackingNumber = $this->normalizeOptionalString($trackingInput['tracking_number'] ?? null);

        if ($trackingNumber === null) {
            throw new HttpException(422, 'Tracking number is required.');
        }

        return [
            'id' => isset($trackingInput['id']) ? (string) $trackingInput['id'] : null,
            'tracking_number' => strtoupper($trackingNumber),
            'carrier' => $this->normalizeOptionalString($trackingInput['carrier'] ?? null),
            'dispatched_at' => $this->normalizeOptionalString($trackingInput['dispatched_at'] ?? null),
            'note' => $this->normalizeOptionalString($trackingInput['note'] ?? null),
            'package_items' => $selectedItems,
            'has_tracking_items' => isset($trackingInput['tracking_items']) || isset($trackingInput['package_items']),
            // Omitted means preserve legacy links. An explicit array replaces only
            // the purchase links of this tracking; it never invokes purchase sync.
            'taobao_purchase_order_ids' => array_key_exists('taobao_purchase_order_ids', $trackingInput)
                ? array_map('intval', $trackingInput['taobao_purchase_order_ids'] ?? [])
                : null,
        ];
    }

    private function assertTrackingNumbersUniqueWithinOrder($trackingPayloads): void
    {
        $trackingNumbers = [];

        foreach ($trackingPayloads as $payload) {
            $trackingNumber = strtoupper((string) $payload['tracking_number']);

            if (isset($trackingNumbers[$trackingNumber])) {
                throw new HttpException(422, sprintf('Tracking number "%s" is duplicated in this order.', $payload['tracking_number']));
            }

            $trackingNumbers[$trackingNumber] = true;
        }
    }

    private function assertTrackingQuantitiesWithinOrderLimits($trackingPayloads, $orderItems): void
    {
        $totalsByOrderItemId = [];

        foreach ($trackingPayloads as $payload) {
            foreach ($payload['package_items'] as $selection) {
                $orderItemId = (string) $selection['order_item']->id;
                $totalsByOrderItemId[$orderItemId] = ($totalsByOrderItemId[$orderItemId] ?? 0) + $selection['quantity'];
            }
        }

        foreach ($totalsByOrderItemId as $orderItemId => $assignedQuantity) {
            /** @var OrderItem|null $orderItem */
            $orderItem = $orderItems->get($orderItemId);

            if (! $orderItem) {
                throw new HttpException(422, 'Selected tracking item does not belong to this order.');
            }

            if ($assignedQuantity > (int) $orderItem->quantity) {
                throw new HttpException(
                    422,
                    sprintf('Assigned tracking quantity exceeds available order quantity for item "%s".', $orderItem->product_name),
                );
            }
        }
    }

    private function calculateDeclaredValueFromSelections($selectedItems): string
    {
        return $selectedItems->reduce(function (string $sum, array $selection) {
            /** @var OrderItem $orderItem */
            $orderItem = $selection['order_item'];

            return $this->pricingService->addCny(
                $sum,
                $this->pricingService->multiplyCnyByQuantity((string) $orderItem->price_cny, (int) $selection['quantity']),
            );
        }, '0.00');
    }

    private function reconcilePackagesWithTracking(OrderTracking $tracking): void
    {
        $packages = CnPackage::query()
            ->where('tracking_number', $tracking->tracking_number)
            ->get();

        foreach ($packages as $package) {
            $package->update([
                'order_id' => $tracking->order_id,
                'order_tracking_id' => $tracking->id,
                'declared_value' => $tracking->declared_value,
                'carrier' => $package->carrier ?: ($tracking->carrier ?: 'VN Express'),
                'status' => 'matched',
            ]);
        }

        $hasPackages = $packages->isNotEmpty();
        $hasReceivedPackages = $packages->contains(fn (CnPackage $package) => $package->received_at !== null);

        $tracking->update([
            'status' => $hasReceivedPackages ? 'received' : ($hasPackages ? 'matched' : 'pending'),
        ]);
    }

    private function orderRelations(): array
    {
        return [
            'items',
            'customer',
            'creator',
            'cnPackages.warehouse',
            'cnPackages.orderTracking',
            'orderTrackings.trackingItems.orderItem',
            'orderTrackings.packages',
            'depositVoucher.transactions',
            'deliveryRequest.address',
        ];
    }

    private function normalizeOptionalString(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    private function filled(array $values, string $key): bool
    {
        if (! array_key_exists($key, $values)) {
            return false;
        }

        $value = $values[$key];

        return $value !== null && trim((string) $value) !== '';
    }
}
