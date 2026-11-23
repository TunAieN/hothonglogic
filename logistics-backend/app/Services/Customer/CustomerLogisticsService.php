<?php

namespace App\Services\Customer;

use App\Models\CnPackage;
use App\Models\Order;
use App\Models\OrderTracking;
use App\Support\Utf8ValueNormalizer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class CustomerLogisticsService
{
    public function ownedPackagesQuery(int $customerId): Builder
    {
        return CnPackage::query()
            ->where(function (Builder $query) use ($customerId) {
                $query->whereHas('order', fn (Builder $order) => $order->where('customer_id', $customerId))
                    ->orWhereHas('orderTracking.order', fn (Builder $order) => $order->where('customer_id', $customerId))
                    ->orWhereHas('packageItems.orderItem.order', fn (Builder $order) => $order->where('customer_id', $customerId));
            })
            ->whereDoesntHave('order', fn (Builder $order) => $order->where('customer_id', '!=', $customerId))
            ->whereDoesntHave('orderTracking.order', fn (Builder $order) => $order->where('customer_id', '!=', $customerId))
            ->whereDoesntHave('packageItems.orderItem.order', fn (Builder $order) => $order->where('customer_id', '!=', $customerId));
    }

    public function packageRelations(): array
    {
        return [
            'warehouse', 'order.items', 'order.shippingTasks',
            'orderTracking.order.shippingTasks', 'orderTracking.trackingItems.orderItem',
            'packageItems.orderItem.order.shippingTasks',
            'currentBatchPackage.batch.vnBatchReceipt.warehouse',
            'vnPackages.receipt.warehouse',
        ];
    }

    public function applyPackageFilters(Builder $query, array $filters): Builder
    {
        if ($tracking = trim((string) ($filters['tracking_number'] ?? ''))) {
            $query->where(fn (Builder $builder) => $builder->where('tracking_number', 'like', '%'.$tracking.'%')
                ->orWhereHas('orderTracking', fn (Builder $trackingQuery) => $trackingQuery->where('tracking_number', 'like', '%'.$tracking.'%')));
        }
        if ($packageId = $filters['package_id'] ?? null) {
            $query->whereKey((int) $packageId);
        }
        if ($orderCode = trim((string) ($filters['order_code'] ?? ''))) {
            $query->where(fn (Builder $builder) => $builder->whereHas('order', fn (Builder $order) => $order->where('order_code', 'like', '%'.$orderCode.'%'))
                ->orWhereHas('orderTracking.order', fn (Builder $order) => $order->where('order_code', 'like', '%'.$orderCode.'%'))
                ->orWhereHas('packageItems.orderItem.order', fn (Builder $order) => $order->where('order_code', 'like', '%'.$orderCode.'%')));
        }
        if ($filters['recorded_from'] ?? null) {
            $query->where('created_at', '>=', $filters['recorded_from'].' 00:00:00');
        }
        if ($filters['recorded_to'] ?? null) {
            $query->where('created_at', '<=', $filters['recorded_to'].' 23:59:59');
        }
        if ($warehouse = $filters['warehouse'] ?? null) {
            $this->applyWarehouseFilter($query, $warehouse);
        }
        if ($status = $filters['status'] ?? null) {
            $this->applyStatusFilter($query, $status);
        }

        return $query;
    }

    public function statistics(Builder $ownedQuery): array
    {
        return [
            'total' => (clone $ownedQuery)->count(),
            'cn_received' => (clone $ownedQuery)->whereNotNull('received_at')->count(),
            'in_transit' => (clone $ownedQuery)->whereHas('batchPackages.batch', fn (Builder $batch) => $batch->whereNotNull('departed_at')->whereNull('arrived_at'))
                ->whereDoesntHave('vnPackages', fn (Builder $vn) => $vn->where(fn (Builder $time) => $time->whereNotNull('scanned_at')->orWhereNotNull('received_at')))->count(),
            'vn_received' => (clone $ownedQuery)->whereHas('vnPackages', fn (Builder $vn) => $vn->where(fn (Builder $time) => $time->whereNotNull('scanned_at')->orWhereNotNull('received_at')))->count(),
        ];
    }

    public function packagePayload(CnPackage $package, bool $detailed = false): array
    {
        $order = $this->resolveOrder($package);
        $tracking = $package->orderTracking;
        $batchLink = $package->currentBatchPackage;
        $batch = $batchLink?->batch;
        $vnPackages = $package->vnPackages;
        $latestVn = $vnPackages->sortByDesc(fn ($entry) => $entry->received_at ?? $entry->scanned_at ?? $entry->created_at)->first();
        $status = $this->presentStatus($package, $batch, $vnPackages);
        $latestEvent = collect([$tracking?->created_at, $tracking?->dispatched_at, $package->received_at, $batchLink?->created_at, $batch?->departed_at, $batch?->arrived_at])
            ->merge($vnPackages->flatMap(fn ($entry) => [$entry->scanned_at, $entry->received_at]))->filter()->sortDesc()->first();
        $weight = $latestVn?->actual_weight ?? $package->weight;

        $payload = [
            'id' => (int) $package->id,
            'display_code' => 'ID kiện #'.$package->id,
            'tracking_number' => Utf8ValueNormalizer::string($package->tracking_number ?: $tracking?->tracking_number, 'cn_packages', (int) $package->id, 'tracking_number'),
            'carrier' => Utf8ValueNormalizer::string($package->carrier ?: $tracking?->carrier, 'cn_packages', (int) $package->id, 'carrier'),
            'order' => $order ? ['id' => (int) $order->id, 'code' => Utf8ValueNormalizer::string($order->order_code, 'orders', (int) $order->id, 'order_code')] : null,
            'status' => $status,
            'warehouse' => $this->warehousePayload($package, $batch, $latestVn),
            'weight_kg' => $weight === null ? null : (float) $weight,
            'received_cn_at' => $package->received_at?->toISOString(),
            'latest_event_at' => $latestEvent?->toISOString(),
            'recorded_at' => $package->created_at?->toISOString(),
            'has_vn_record' => $vnPackages->isNotEmpty(),
        ];

        if ($detailed) {
            $payload += [
                'products' => $this->productsPayload($package),
                'batch' => $batch ? [
                    'code' => Utf8ValueNormalizer::string($batch->batch_code, 'cn_batches', (int) $batch->id, 'batch_code'),
                    'status' => $batch->status,
                    'route_name' => Utf8ValueNormalizer::string($batch->route_name, 'cn_batches', (int) $batch->id, 'route_name'),
                    'origin' => Utf8ValueNormalizer::string($package->warehouse?->name, 'cn_warehouses', (int) $package->warehouse_id, 'name'),
                    'destination' => Utf8ValueNormalizer::string($batch->destination_warehouse_name, 'cn_batches', (int) $batch->id, 'destination_warehouse_name'),
                    'departed_at' => $batch->departed_at?->toISOString(),
                    'expected_arrival_at' => $batch->expected_arrival_at?->toISOString(),
                    'arrived_at' => $batch->arrived_at?->toISOString(),
                ] : null,
                'domestic_delivery' => $this->domesticDeliveryPayload($order),
                'timeline' => $this->timeline($package, $tracking, $batchLink, $batch, $vnPackages),
            ];
        }

        return $payload;
    }

    public function trackingResults(int $customerId, string $code): Collection
    {
        $normalized = trim($code);
        $packages = $this->ownedPackagesQuery($customerId)->with($this->packageRelations())
            ->where(function (Builder $query) use ($normalized) {
                $query->where('id', ctype_digit($normalized) ? (int) $normalized : -1)
                    ->orWhere('tracking_number', $normalized)
                    ->orWhereHas('orderTracking', fn (Builder $tracking) => $tracking->where('tracking_number', $normalized))
                    ->orWhereHas('order', fn (Builder $order) => $order->where('order_code', $normalized))
                    ->orWhereHas('orderTracking.order', fn (Builder $order) => $order->where('order_code', $normalized))
                    ->orWhereHas('packageItems.orderItem.order', fn (Builder $order) => $order->where('order_code', $normalized));
            })->get();

        $packageTrackingIds = $packages->pluck('order_tracking_id')->filter()->values();

        $trackings = OrderTracking::query()->with(['order', 'trackingItems.orderItem'])
            ->whereHas('order', fn (Builder $order) => $order->where('customer_id', $customerId))
            ->where(function (Builder $query) use ($normalized, $packageTrackingIds) {
                $query->where('tracking_number', $normalized)
                    ->orWhereHas('order', fn (Builder $order) => $order->where('order_code', $normalized));

                if ($packageTrackingIds->isNotEmpty()) {
                    $query->orWhereIn('id', $packageTrackingIds);
                }
            })
            ->get();

        return $trackings->map(function (OrderTracking $tracking) use ($packages) {
            $ownedPackages = $packages->where('order_tracking_id', $tracking->id)->values();
            return $this->trackingGroupPayload($tracking, $ownedPackages);
        })->concat(
            $packages->whereNull('order_tracking_id')->map(fn (CnPackage $package) => [
                'key' => 'package-'.$package->id,
                'tracking' => null,
                'order' => ($order = $this->resolveOrder($package)) ? ['id' => (int) $order->id, 'code' => $order->order_code] : null,
                'packages' => [$this->packagePayload($package, true)],
            ])
        )->values();
    }

    public function orderTrackingResults(Order $order): Collection
    {
        $order->load(['orderTrackings.order', 'orderTrackings.trackingItems.orderItem']);
        $packages = $this->ownedPackagesQuery((int) $order->customer_id)->with($this->packageRelations())
            ->where(fn (Builder $query) => $query->where('order_id', $order->id)
                ->orWhereHas('orderTracking', fn (Builder $tracking) => $tracking->where('order_id', $order->id))
                ->orWhereHas('packageItems.orderItem', fn (Builder $item) => $item->where('order_id', $order->id)))
            ->get();

        return $order->orderTrackings->map(fn (OrderTracking $tracking) => $this->trackingGroupPayload($tracking, $packages->where('order_tracking_id', $tracking->id)->values()))
            ->concat($packages->whereNull('order_tracking_id')->map(fn (CnPackage $package) => ['key' => 'package-'.$package->id, 'tracking' => null, 'order' => ['id' => (int) $order->id, 'code' => $order->order_code], 'packages' => [$this->packagePayload($package, true)]]))->values();
    }

    private function trackingGroupPayload(OrderTracking $tracking, Collection $packages): array
    {
        return [
            'key' => 'tracking-'.$tracking->id,
            'tracking' => [
                'id' => (int) $tracking->id,
                'number' => Utf8ValueNormalizer::string($tracking->tracking_number, 'order_trackings', (int) $tracking->id, 'tracking_number'),
                'carrier' => Utf8ValueNormalizer::string($tracking->carrier, 'order_trackings', (int) $tracking->id, 'carrier'),
                'status' => $tracking->status,
                'recorded_at' => $tracking->created_at?->toISOString(),
                'dispatched_at' => $tracking->dispatched_at?->toISOString(),
            ],
            'order' => ['id' => (int) $tracking->order->id, 'code' => Utf8ValueNormalizer::string($tracking->order->order_code, 'orders', (int) $tracking->order->id, 'order_code')],
            'packages' => $packages->map(fn (CnPackage $package) => $this->packagePayload($package, true))->values(),
            'timeline' => $packages->isEmpty() ? array_values(array_filter([
                $tracking->created_at ? ['key' => 'tracking_recorded', 'label' => 'Nhân viên ghi nhận mã vận đơn', 'occurred_at' => $tracking->created_at->toISOString(), 'location' => null, 'kind' => 'event'] : null,
                $tracking->dispatched_at ? ['key' => 'seller_dispatched', 'label' => 'Người bán phát hàng', 'occurred_at' => $tracking->dispatched_at->toISOString(), 'location' => null, 'kind' => 'event'] : null,
            ])) : [],
        ];
    }

    private function resolveOrder(CnPackage $package): ?Order
    {
        return $package->order ?: $package->orderTracking?->order ?: $package->packageItems->first()?->orderItem?->order;
    }

    private function presentStatus(CnPackage $package, $batch, Collection $vnPackages): array
    {
        if ($vnPackages->contains(fn ($entry) => $entry->delivery_status === 'delivered')) return ['key' => 'delivered', 'label' => 'Đã giao'];
        if ($vnPackages->contains(fn ($entry) => $entry->received_at || $entry->scanned_at)) return ['key' => 'vn_received', 'label' => 'Đã đến kho Việt Nam'];
        if ($batch?->arrived_at) return ['key' => 'arrived_vn', 'label' => 'Lô đã đến Việt Nam'];
        if ($batch?->departed_at) return ['key' => 'in_transit', 'label' => 'Đang vận chuyển về Việt Nam'];
        if ($package->received_at) return ['key' => 'cn_received', 'label' => 'Đã đến kho Trung Quốc'];
        return ['key' => 'recorded', 'label' => 'Đã ghi nhận kiện'];
    }

    private function warehousePayload(CnPackage $package, $batch, $latestVn): array
    {
        if ($latestVn && ($latestVn->received_at || $latestVn->scanned_at)) return ['stage' => 'vn', 'label' => $latestVn->receipt?->warehouse?->name ?: 'Kho Việt Nam'];
        if ($batch?->departed_at && ! $batch?->arrived_at) return ['stage' => 'transit', 'label' => 'Trên đường Trung Quốc → Việt Nam'];
        return ['stage' => 'cn', 'label' => $package->warehouse?->name ?: 'Kho Trung Quốc'];
    }

    private function productsPayload(CnPackage $package): array
    {
        $items = $package->packageItems->map(fn ($link) => ['item' => $link->orderItem, 'quantity' => (int) $link->quantity]);
        return $items->filter(fn ($entry) => $entry['item'])->map(fn ($entry) => [
            'id' => (int) $entry['item']->id,
            'name' => Utf8ValueNormalizer::string($entry['item']->product_name, 'order_items', (int) $entry['item']->id, 'product_name'),
            'image' => Utf8ValueNormalizer::string($entry['item']->product_image, 'order_items', (int) $entry['item']->id, 'product_image'),
            'variant' => collect([$entry['item']->color, $entry['item']->size])->filter()->implode(' / ') ?: null,
            'quantity' => $entry['quantity'],
        ])->values()->all();
    }

    private function domesticDeliveryPayload(?Order $order): ?array
    {
        $task = $order?->shippingTasks?->sortByDesc('id')->first();
        if (! $task) return null;
        $labels = ['created' => 'Đã tạo nhiệm vụ giao hàng', 'preparing' => 'Đang chuẩn bị giao', 'in_transit' => 'Đang giao nội địa', 'completed' => 'Đã giao', 'cancelled' => 'Đã hủy giao'];
        return ['task_code' => $task->task_code, 'status' => $task->status, 'label' => $labels[$task->status] ?? $task->status, 'carrier' => $task->carrier_name];
    }

    private function timeline(CnPackage $package, $tracking, $batchLink, $batch, Collection $vnPackages): array
    {
        $events = collect();
        if ($tracking?->created_at) $events->push(['key' => 'tracking_recorded', 'label' => 'Nhân viên ghi nhận mã vận đơn', 'occurred_at' => $tracking->created_at->toISOString(), 'location' => null, 'kind' => 'event']);
        if ($tracking?->dispatched_at) $events->push(['key' => 'seller_dispatched', 'label' => 'Người bán phát hàng', 'occurred_at' => $tracking->dispatched_at->toISOString(), 'location' => null, 'kind' => 'event']);
        if ($package->received_at) $events->push(['key' => 'cn_received', 'label' => 'Kho Trung Quốc nhận kiện', 'occurred_at' => $package->received_at->toISOString(), 'location' => $package->warehouse?->name, 'kind' => 'event']);
        if ($batchLink?->created_at) $events->push(['key' => 'batch_joined', 'label' => 'Kiện được ghép lô', 'occurred_at' => $batchLink->created_at->toISOString(), 'location' => $batch?->batch_code, 'kind' => 'event']);
        if ($batch?->departed_at) $events->push(['key' => 'batch_departed', 'label' => 'Lô hàng xuất kho Trung Quốc', 'occurred_at' => $batch->departed_at->toISOString(), 'location' => $batch->route_name, 'kind' => 'event']);
        if ($batch?->expected_arrival_at && ! $batch?->arrived_at) $events->push(['key' => 'batch_eta', 'label' => 'Dự kiến đến Việt Nam', 'occurred_at' => $batch->expected_arrival_at->toISOString(), 'location' => $batch->destination_warehouse_name, 'kind' => 'estimate']);
        if ($batch?->arrived_at) $events->push(['key' => 'batch_arrived', 'label' => 'Lô hàng đến Việt Nam', 'occurred_at' => $batch->arrived_at->toISOString(), 'location' => $batch->destination_warehouse_name, 'kind' => 'event']);
        foreach ($vnPackages as $vn) {
            if ($vn->scanned_at) $events->push(['key' => 'vn_scanned_'.$vn->id, 'label' => 'Kho Việt Nam quét kiện', 'occurred_at' => $vn->scanned_at->toISOString(), 'location' => $vn->receipt?->warehouse?->name, 'kind' => 'event']);
            if ($vn->received_at && (! $vn->scanned_at || ! $vn->received_at->equalTo($vn->scanned_at))) $events->push(['key' => 'vn_received_'.$vn->id, 'label' => 'Kho Việt Nam nhận kiện', 'occurred_at' => $vn->received_at->toISOString(), 'location' => $vn->receipt?->warehouse?->name, 'kind' => 'event']);
        }
        return $events->sortBy('occurred_at')->values()->all();
    }

    private function applyWarehouseFilter(Builder $query, string $warehouse): void
    {
        if ($warehouse === 'vn') $query->whereHas('vnPackages', fn (Builder $vn) => $vn->where(fn (Builder $time) => $time->whereNotNull('scanned_at')->orWhereNotNull('received_at')));
        elseif ($warehouse === 'transit') $query->whereHas('batchPackages.batch', fn (Builder $batch) => $batch->whereNotNull('departed_at')->whereNull('arrived_at'))->whereDoesntHave('vnPackages', fn (Builder $vn) => $vn->whereNotNull('scanned_at'));
        elseif ($warehouse === 'cn') $query->whereDoesntHave('batchPackages.batch', fn (Builder $batch) => $batch->whereNotNull('departed_at'))->whereDoesntHave('vnPackages', fn (Builder $vn) => $vn->where(fn (Builder $time) => $time->whereNotNull('scanned_at')->orWhereNotNull('received_at')));
    }

    private function applyStatusFilter(Builder $query, string $status): void
    {
        if ($status === 'delivered') $query->whereHas('vnPackages', fn (Builder $vn) => $vn->where('delivery_status', 'delivered'));
        elseif ($status === 'vn_received') $query->whereHas('vnPackages', fn (Builder $vn) => $vn->where(fn (Builder $time) => $time->whereNotNull('scanned_at')->orWhereNotNull('received_at')))->whereDoesntHave('vnPackages', fn (Builder $vn) => $vn->where('delivery_status', 'delivered'));
        elseif ($status === 'in_transit') $query->whereHas('batchPackages.batch', fn (Builder $batch) => $batch->whereNotNull('departed_at')->whereNull('arrived_at'))->whereDoesntHave('vnPackages', fn (Builder $vn) => $vn->where(fn (Builder $time) => $time->whereNotNull('scanned_at')->orWhereNotNull('received_at')));
        elseif ($status === 'cn_received') $query->whereNotNull('received_at')->whereDoesntHave('batchPackages.batch', fn (Builder $batch) => $batch->whereNotNull('departed_at'))->whereDoesntHave('vnPackages', fn (Builder $vn) => $vn->where(fn (Builder $time) => $time->whereNotNull('scanned_at')->orWhereNotNull('received_at')));
        elseif ($status === 'recorded') $query->whereNull('received_at')->whereDoesntHave('batchPackages.batch', fn (Builder $batch) => $batch->whereNotNull('departed_at'))->whereDoesntHave('vnPackages', fn (Builder $vn) => $vn->where(fn (Builder $time) => $time->whereNotNull('scanned_at')->orWhereNotNull('received_at')));
    }
}
