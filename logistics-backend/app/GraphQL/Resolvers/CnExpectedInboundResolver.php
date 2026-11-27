<?php

namespace App\GraphQL\Resolvers;

use App\Models\OrderTracking;
use App\Models\TaobaoPurchaseOrder;
use App\Services\Auth\PermissionService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class CnExpectedInboundResolver
{
    public function __construct(private readonly PermissionService $permissions)
    {
    }

    public function list($_, array $args): array
    {
        // The schema middleware checks the warehouse permission. Customer/order data
        // additionally requires the normal order read permission.
        $this->permissions->authorize(Auth::user(), 'orders.read');

        $filter = $args['filter'] ?? [];
        $first = min(50, max(1, (int) ($args['first'] ?? 10)));
        $page = max(1, (int) ($args['page'] ?? 1));

        $query = $this->applyExpectedScope(OrderTracking::query())
            ->with([
                'order.customer',
                'trackingItems.orderItem',
                'taobaoPurchaseOrders:id,order_id,external_order_code,shop_id,shop_name,status',
            ]);

        $this->applyFilters($query, $filter);

        $orderCount = (clone $query)->distinct()->count('order_trackings.order_id');
        $customerCount = (clone $query)
            ->join('orders as expected_orders', 'expected_orders.id', '=', 'order_trackings.order_id')
            ->distinct()
            ->count('expected_orders.customer_id');

        $paginator = $query
            ->select('order_trackings.*')
            ->selectRaw($this->conflictExistsSql().' as has_data_conflict')
            ->orderByDesc('order_trackings.created_at')
            ->orderByDesc('order_trackings.id')
            ->paginate($first, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(fn (OrderTracking $tracking) => $this->row($tracking))->all(),
            'paginatorInfo' => [
                'currentPage' => $paginator->currentPage(),
                'lastPage' => $paginator->lastPage(),
                'perPage' => $paginator->perPage(),
                'total' => $paginator->total(),
                'firstItem' => $paginator->firstItem(),
                'lastItem' => $paginator->lastItem(),
                'hasMorePages' => $paginator->hasMorePages(),
            ],
            'summary' => [
                'tracking_count' => $paginator->total(),
                'order_count' => $orderCount,
                'customer_count' => $customerCount,
            ],
            'shops' => $this->shopOptions(),
        ];
    }

    private function applyExpectedScope(Builder $query): Builder
    {
        return $query->where(function (Builder $expected) {
            $expected
                ->whereNotExists(function ($packages) {
                    $packages->selectRaw('1')
                        ->from('cn_packages as received_packages')
                        ->whereNotNull('received_packages.received_at')
                        ->whereRaw($this->normalizedTrackingSql('received_packages.tracking_number').' = '.$this->normalizedTrackingSql('order_trackings.tracking_number'))
                        ->where(function ($link) {
                            $link->whereNull('received_packages.order_tracking_id')
                                ->orWhereColumn('received_packages.order_tracking_id', 'order_trackings.id');
                        });
                })
                ->orWhereExists(function ($packages) {
                    $packages->selectRaw('1')
                        ->from('cn_packages as conflicting_packages')
                        ->whereRaw($this->conflictWhereSql());
                });
        });
    }

    private function applyFilters(Builder $query, array $filter): void
    {
        $search = trim((string) ($filter['search'] ?? ''));
        if ($search !== '') {
            $query->where(function (Builder $searchQuery) use ($search) {
                $like = '%'.$search.'%';
                $searchQuery
                    ->where('order_trackings.tracking_number', 'like', $like)
                    ->orWhereHas('order', fn (Builder $orders) => $orders
                        ->where('order_code', 'like', $like)
                        ->orWhereHas('customer', fn (Builder $customers) => $customers
                            ->where('name', 'like', $like)
                            ->orWhere('code', 'like', $like)))
                    ->orWhereHas('taobaoPurchaseOrders', fn (Builder $purchases) => $purchases
                        ->where('external_order_code', 'like', $like)
                        ->orWhere('shop_name', 'like', $like));
            });
        }

        $shop = trim((string) ($filter['shop'] ?? ''));
        if ($shop !== '') {
            $query->whereHas('taobaoPurchaseOrders', fn (Builder $purchases) => $purchases
                ->where('shop_name', $shop));
        }
    }

    private function shopOptions(): array
    {
        return TaobaoPurchaseOrder::query()
            ->whereNotNull('shop_name')
            ->where('shop_name', '<>', '')
            ->whereHas('trackings', fn (Builder $trackings) => $this->applyExpectedScope($trackings))
            ->distinct()
            ->orderBy('shop_name')
            ->pluck('shop_name')
            ->values()
            ->all();
    }

    private function row(OrderTracking $tracking): array
    {
        $hasConflict = (bool) $tracking->getAttribute('has_data_conflict');
        $trackingItems = $tracking->trackingItems
            ->filter(fn ($item) => $item->orderItem !== null)
            ->values();

        return [
            'id' => (string) $tracking->id,
            'tracking_number' => $tracking->tracking_number,
            'display_status' => $hasConflict ? 'data_conflict' : 'waiting_receipt',
            'can_receive' => ! $hasConflict,
            'order' => $tracking->order ? [
                'id' => (string) $tracking->order->id,
                'order_code' => $tracking->order->order_code,
                'customer' => $tracking->order->customer ? [
                    'id' => (string) $tracking->order->customer->id,
                    'code' => $tracking->order->customer->code,
                    'name' => $tracking->order->customer->name,
                ] : null,
            ] : null,
            'purchase_orders' => $tracking->taobaoPurchaseOrders->map(fn ($purchase) => [
                'id' => (string) $purchase->id,
                'external_order_code' => $purchase->external_order_code,
                'shop_name' => $purchase->shop_name,
            ])->values()->all(),
            'products' => $trackingItems->map(fn ($trackingItem) => [
                'id' => (string) $trackingItem->orderItem->id,
                'name' => $trackingItem->orderItem->product_name,
                'image' => $trackingItem->orderItem->product_image,
                'sku' => collect([$trackingItem->orderItem->color, $trackingItem->orderItem->size])->filter()->join(' / ') ?: null,
                'quantity' => (int) $trackingItem->quantity,
            ])->all(),
            'product_summary' => [
                'allocated' => $trackingItems->isNotEmpty(),
                'sku_count' => $trackingItems->count(),
                'total_quantity' => (int) $trackingItems->sum('quantity'),
            ],
            // No expected warehouse foreign key exists on order_trackings in schema 057.
            'warehouse' => null,
        ];
    }

    private function normalizedTrackingSql(string $column): string
    {
        return 'UPPER(TRIM(COALESCE('.$column.", '')))";
    }

    private function conflictWhereSql(): string
    {
        $packageTracking = $this->normalizedTrackingSql('conflicting_packages.tracking_number');
        $expectedTracking = $this->normalizedTrackingSql('order_trackings.tracking_number');

        return '((conflicting_packages.order_tracking_id = order_trackings.id AND '.$packageTracking.' <> '.$expectedTracking.')'
            .' OR ('.$packageTracking.' = '.$expectedTracking.' AND conflicting_packages.order_tracking_id IS NOT NULL'
            .' AND conflicting_packages.order_tracking_id <> order_trackings.id))';
    }

    private function conflictExistsSql(): string
    {
        return 'EXISTS (SELECT 1 FROM cn_packages AS conflicting_packages WHERE '.$this->conflictWhereSql().')';
    }
}
