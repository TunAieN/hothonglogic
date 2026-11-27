<?php

namespace App\GraphQL\Resolvers;

use App\Exceptions\CnPackageInputException;
use App\Models\AuditLog;
use App\Models\CnPackage;
use App\Models\CnPackageItem;
use App\Models\Order;
use App\Models\OrderTracking;
use App\Models\TaobaoPurchaseOrder;
use App\Services\Auth\PermissionService;
use App\Support\BusinessWriteGuard;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Collection;

class CnTrackingPurchaseLinkResolver
{
    public function show($_, array $args): array
    {
        $this->authorize();
        $package = CnPackage::query()->with('orderTracking')->findOrFail($args['package_id']);
        $tracking = $this->requireReceivedTracking($package, $package->orderTracking);
        $order = Order::query()->findOrFail($tracking->order_id);

        return [
            'tracking_number' => $tracking->tracking_number,
            'tracking_status' => $tracking->status,
            'order_code' => $order->order_code,
            'purchase_ids' => $this->linkedIds($tracking),
            'purchases' => $order->taobaoPurchaseOrders()->with(['items.orderItem', 'trackings'])->orderBy('id')->get()->map(fn ($purchase) => [
                'id' => $purchase->id,
                'code' => $purchase->external_order_code,
                'shop' => $purchase->shop_name,
                'tracking_numbers' => $purchase->trackings->pluck('tracking_number')->all(),
                'items' => $purchase->items->map(fn ($item) => [
                    'name' => $item->orderItem?->product_name,
                    'variant' => $this->variant($item->orderItem),
                    'quantity' => $item->quantity,
                ])->all(),
            ])->all(),
            'inspected_items' => $package->packageItems()->with('orderItem')->get()->map(fn ($item) => [
                'name' => $item->orderItem?->product_name,
                'variant' => $this->variant($item->orderItem),
                'quantity' => $item->quantity,
            ])->all(),
        ];
    }

    public function update($_, array $args): array
    {
        $this->authorize();
        BusinessWriteGuard::assertEnabled(__METHOD__);
        $input = $args['input'];
        $reason = trim($input['reason']);
        if ($reason === '' || mb_strlen($reason) > 1000) {
            throw new CnPackageInputException('Nhập căn cứ xác minh, tối đa 1000 ký tự.', 'reason');
        }
        $selected = $this->ids($input['purchase_ids']);
        $expected = $this->ids($input['expected_purchase_ids']);
        $orderId = CnPackage::query()->findOrFail($input['package_id'])->order_id;

        return DB::transaction(function () use ($input, $orderId, $reason, $selected, $expected) {
            $order = $orderId ? Order::query()->lockForUpdate()->find($orderId) : null;
            $package = CnPackage::query()->lockForUpdate()->findOrFail($input['package_id']);
            $tracking = $this->requireReceivedTracking($package, $package->orderTracking()->lockForUpdate()->first());
            if (! $order || (string) $tracking->order_id !== (string) $order->id || (string) $tracking->id !== (string) $input['tracking_id']) {
                throw new CnPackageInputException('Kiện hoặc tracking đã thay đổi. Hãy mở lại cửa sổ xác minh.');
            }

            $before = $this->linkedIds($tracking);
            if ($before !== $expected) {
                throw new CnPackageInputException('Liên kết đã được người khác cập nhật. Hãy mở lại cửa sổ xác minh.');
            }
            if ($order->taobaoPurchaseOrders()->whereIn('id', $selected)->count() !== count($selected)) {
                throw new CnPackageInputException('Đơn mua Taobao đã chọn phải thuộc đúng đơn VietTrung.');
            }
            $added = array_values(array_diff($selected, $before));
            $removed = array_values(array_diff($before, $selected));
            if ($input['add_only'] ?? false) {
                if ($removed !== []) {
                    throw new CnPackageInputException('Phải giữ các đơn mua Taobao đang liên kết khi bổ sung nguồn mua.');
                }
                if ($added === []) {
                    return ['purchase_ids' => $before];
                }
                $inspectedIds = $package->packageItems()->where('quantity', '>', 0)->pluck('order_item_id');
                $matchingPurchases = $order->taobaoPurchaseOrders()->whereIn('id', $added)
                    ->whereHas('items', fn ($query) => $query->whereIn('order_item_id', $inspectedIds)->where('quantity', '>', 0))
                    ->count();
                if ($matchingPurchases !== count($added)) {
                    throw new CnPackageInputException('Đơn mua bổ sung phải chứa sản phẩm đã xác nhận trong kiện.');
                }
            }
            if ($removed !== []) {
                $tracking->taobaoPurchaseOrders()->detach($removed);
            }
            if ($added !== []) {
                $tracking->taobaoPurchaseOrders()->attach($added, ['linked_by' => Auth::id()]);
            }

            AuditLog::create([
                'user_id' => Auth::id(),
                'action' => 'taobao_purchase_tracking_links_verified',
                'entity_type' => OrderTracking::class,
                'entity_id' => $tracking->id,
                'before_data' => ['taobao_purchase_order_ids' => $before],
                'after_data' => [
                    'taobao_purchase_order_ids' => $selected,
                    'added' => $added, 'removed' => $removed, 'reason' => $reason, 'cn_package_id' => $package->id,
                ],
                'created_at' => now(),
            ]);

            return ['purchase_ids' => $selected];
        }, 3);
    }

    public function inspectionReview($_, array $args): array
    {
        $permissions = app(PermissionService::class);
        $actor = Auth::user();
        $permissions->authorize($actor, 'cn_packages.read');
        $canVerify = $permissions->allows($actor, 'orders.read') && $permissions->allows($actor, 'orders.update');
        if (! $canVerify) {
            $permissions->authorize($actor, 'cn_packages.inspect');
        }

        $package = CnPackage::query()->with('orderTracking')->findOrFail($args['package_id']);
        $tracking = $this->requireReceivedTracking($package, $package->orderTracking);
        $order = Order::query()->findOrFail($tracking->order_id);
        $orderItems = $order->items()->get(['id', 'quantity'])->keyBy('id');
        $items = $args['items'] ?? $package->packageItems()->whereIn('order_item_id', $orderItems->keys())
            ->get(['order_item_id', 'quantity'])->toArray();
        $selected = collect($items)->keyBy('order_item_id');
        if ($selected->count() !== count($items) || $selected->keys()->diff($orderItems->keys())->isNotEmpty()
            || $selected->contains(fn (array $item) => $item['quantity'] < 1)) {
            throw new CnPackageInputException('Các dòng đối chiếu phải có số lượng hợp lệ và thuộc đúng đơn VietTrung.');
        }

        $elsewhere = CnPackageItem::query()->whereIn('order_item_id', $orderItems->keys())
            ->where('cn_package_id', '<>', $package->id)->groupBy('order_item_id')
            ->selectRaw('order_item_id, SUM(quantity) AS quantity')->pluck('quantity', 'order_item_id');
        $quantities = $orderItems->map(fn ($item) => [
            'order_item_id' => $item->id,
            'checked_elsewhere' => (int) $elsewhere->get($item->id, 0),
            'remaining' => max(0, (int) $item->quantity - (int) $elsewhere->get($item->id, 0)),
        ])->values()->all();

        $linkedIds = $this->linkedIds($tracking);
        $purchases = $order->taobaoPurchaseOrders()->with('items')->orderBy('id')->get();
        $linked = $purchases->filter(fn ($purchase) => in_array((string) $purchase->id, $linkedIds, true));
        $candidates = $purchases->diff($linked)->filter(fn ($purchase) => $purchase->items->contains(
            fn ($item) => $item->quantity > 0 && $selected->has($item->order_item_id)
        ));
        $linkedTotals = $linked->flatMap->items->groupBy('order_item_id')->map(fn ($items) => $items->sum('quantity'));
        $conflict = $linked->count() !== count($linkedIds) || ($linkedIds !== [] && $selected->contains(
            fn (array $item) => $linkedTotals->get($item['order_item_id'], 0) < $item['quantity']
        ));
        $ambiguous = $selected->keys()->contains(fn ($id) => $purchases->filter(fn ($purchase) => $purchase->items->contains(
            fn ($item) => (string) $item->order_item_id === (string) $id && $item->quantity > 0
        ))->count() > 1);

        $status = match (true) {
            $conflict => 'conflict',
            $linkedIds !== [] => 'linked',
            $selected->isEmpty() => 'no_items',
            $candidates->isNotEmpty() => 'candidates',
            $purchases->isEmpty() => 'no_purchase_data',
            default => 'unknown',
        };

        // Purchase membership and quantity alone are not delivery evidence.
        // The current schema only stores a purchase/tracking relation once linked.
        return [
            'quantities' => $quantities, 'status' => $status, 'ambiguous' => $ambiguous,
            'purchase_ids' => $canVerify ? $linkedIds : [],
            'candidates' => $canVerify ? $candidates->load('items.orderItem')->map(fn ($purchase) => $this->reviewPurchase($purchase, $selected))->values()->all() : [],
            'linked_purchases' => $canVerify ? $linked->load('items.orderItem')->map(fn ($purchase) => $this->reviewPurchase($purchase, $selected))->values()->all() : [],
        ];
    }

    private function reviewPurchase(TaobaoPurchaseOrder $purchase, Collection $selected): array
    {
        return [
            'id' => $purchase->id, 'code' => $purchase->external_order_code, 'shop' => $purchase->shop_name,
            'tracking_numbers' => [],
            'items' => $purchase->items->filter(fn ($item) => $selected->has($item->order_item_id))
                ->map(fn ($item) => [
                    'order_item_id' => $item->order_item_id, 'name' => $item->orderItem?->product_name,
                    'variant' => $this->variant($item->orderItem), 'quantity' => $item->quantity,
                ])->values()->all(),
        ];
    }

    private function authorize(): void
    {
        $permissions = app(PermissionService::class);
        foreach (['cn_packages.read', 'orders.read', 'orders.update'] as $permission) {
            $permissions->authorize(Auth::user(), $permission);
        }
    }

    private function requireReceivedTracking(CnPackage $package, ?OrderTracking $tracking): OrderTracking
    {
        if (! $package->received_at || $package->status !== 'matched' || ! $tracking
            || (string) $package->order_id !== (string) $tracking->order_id
            || strtoupper(trim((string) $package->tracking_number)) !== strtoupper(trim($tracking->tracking_number))) {
            throw new CnPackageInputException('Chỉ xác minh nguồn mua cho kiện đã nhận và khớp vận đơn.');
        }

        return $tracking;
    }

    private function linkedIds(OrderTracking $tracking): array
    {
        return $this->ids($tracking->taobaoPurchaseOrders()->pluck('taobao_purchase_orders.id')->all());
    }

    private function ids(array $ids): array
    {
        return collect($ids)->map(fn ($id) => (string) $id)->unique()->sort(SORT_STRING)->values()->all();
    }

    private function variant($item): string
    {
        return implode(' / ', array_filter([$item?->color, $item?->size]));
    }
}
