<?php

namespace App\Http\Controllers;

use App\Models\CustomerPurchaseDraft;
use App\Models\CustomerPurchaseDraftItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\Orders\CustomerPurchaseRequestService;
use App\Services\Orders\OrderPricingService;
use App\Support\Utf8ValueNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Carbon\CarbonImmutable;

class CustomerPurchaseController extends Controller
{
    public function __construct(private readonly OrderPricingService $pricing, private readonly CustomerPurchaseRequestService $purchaseRequests) {}

    public function submitPurchaseRequest(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'idempotency_key' => ['required', 'uuid'], 'note' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.local_item_id' => ['required', 'string', 'max:100'],
            'items.*.product_url' => ['required', 'url:http,https', 'max:4000'],
            'items.*.platform' => ['required', 'in:Taobao,Tmall,1688'],
            'items.*.title' => ['required', 'string', 'max:255'],
            'items.*.main_image' => ['nullable', 'url:http,https', 'max:4000'],
            'items.*.sku_id' => ['nullable', 'string', 'max:255'],
            'items.*.selected_attributes' => ['present', 'array', 'max:20'],
            'items.*.selected_attributes.*' => ['string', 'max:255'],
            'items.*.variant_label' => ['nullable', 'string', 'max:500'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'items.*.reference_price_cny' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],
            'items.*.product_note' => ['nullable', 'string', 'max:2000'],
            'items.*.seller' => ['nullable', 'string', 'max:255'], 'items.*.shop_name' => ['nullable', 'string', 'max:255'],
            'items.*.size' => ['nullable', 'string', 'max:255'], 'items.*.color' => ['nullable', 'string', 'max:255'],
            'items.*.sku_required' => ['required', 'boolean'],
        ]);
        $validator->after(function ($validator) use ($request) {
            foreach ($request->input('items', []) as $index => $item) {
                if (($item['sku_required'] ?? false) && trim((string) ($item['sku_id'] ?? '')) === '') {
                    $validator->errors()->add("items.$index.sku_id", 'Sản phẩm có phân loại bắt buộc phải chọn SKU.');
                }
                if (! $this->productUrlMatchesPlatform((string) ($item['product_url'] ?? ''), (string) ($item['platform'] ?? ''))) {
                    $validator->errors()->add("items.$index.product_url", 'Link sản phẩm không khớp nguồn Taobao, Tmall hoặc 1688.');
                }
            }
        });
        $data = $validator->validate();
        $account = $request->user('customer');
        $result = $this->purchaseRequests->submit((int) $account->customer_id, (int) $account->getAuthIdentifier(), $data);
        $order = $result['order']->load($this->orderRelations());

        return response()->json(['order' => $this->orderPayload($order, true), 'idempotent_replay' => ! $result['created']], $result['created'] ? 201 : 200);
    }

    public function workspace(Request $request): JsonResponse
    {
        $this->ensureDraftSchema();
        $customerId = $this->customerId($request);
        $cart = CustomerPurchaseDraft::query()->with('items')->where('customer_id', $customerId)
            ->where('kind', 'cart')->where('status', 'draft')->latest('id')->first();
        $drafts = CustomerPurchaseDraft::query()->with('items')->where('customer_id', $customerId)
            ->where('kind', 'draft')->where('status', 'draft')->latest('updated_at')->get();

        return response()->json(['cart' => $cart ? $this->draftPayload($cart) : null, 'drafts' => $drafts->map(fn ($draft) => $this->draftPayload($draft))]);
    }

    public function storeDraft(Request $request): JsonResponse
    {
        $this->ensureDraftSchema();
        $data = $this->draftInput($request);
        $draft = DB::transaction(function () use ($request, $data) {
            $draft = CustomerPurchaseDraft::create([
                'customer_id' => $this->customerId($request), 'kind' => 'draft', 'status' => 'draft',
                'title' => $data['title'] ?? null, 'note' => $data['note'] ?? null,
                'idempotency_key' => $data['idempotency_key'] ?? null,
            ]);
            foreach ($data['items'] ?? [] as $item) {
                $draft->items()->create($this->itemAttributes($item));
            }

            return $draft->fresh('items');
        });

        return response()->json(['draft' => $this->draftPayload($draft)], 201);
    }

    public function updateDraft(Request $request, int $draft): JsonResponse
    {
        $this->ensureDraftSchema();
        $owned = $this->ownedDraft($request, $draft, 'draft');
        $data = $this->draftInput($request, false);
        $owned = DB::transaction(function () use ($owned, $data) {
            $owned->update(collect($data)->only(['title', 'note', 'idempotency_key'])->all());
            if (array_key_exists('items', $data)) {
                $owned->items()->delete();
                foreach ($data['items'] as $item) {
                    $owned->items()->create($this->itemAttributes($item));
                }
            }

            return $owned->fresh('items');
        });

        return response()->json(['draft' => $this->draftPayload($owned)]);
    }

    public function destroyDraft(Request $request, int $draft): JsonResponse
    {
        $this->ensureDraftSchema();
        $this->ownedDraft($request, $draft, 'draft')->delete();

        return response()->json(['message' => 'Đã xóa bản nháp.']);
    }

    public function addCartItem(Request $request): JsonResponse
    {
        $this->ensureDraftSchema();
        $item = $this->validatedItem($request);
        $cart = DB::transaction(function () use ($request, $item) {
            $cart = CustomerPurchaseDraft::query()->lockForUpdate()->firstOrCreate([
                'customer_id' => $this->customerId($request), 'kind' => 'cart', 'status' => 'draft',
            ], ['title' => 'Giỏ hàng']);
            $cart->items()->create($this->itemAttributes($item));

            return $cart->fresh('items');
        });

        return response()->json(['cart' => $this->draftPayload($cart)], 201);
    }

    public function updateCartItem(Request $request, int $item): JsonResponse
    {
        $this->ensureDraftSchema();
        $owned = $this->ownedCartItem($request, $item);
        $data = $this->validatedItem($request, true);
        $owned->update($this->itemAttributes([...$owned->toArray(), ...$data]));

        return response()->json(['cart' => $this->draftPayload($owned->draft->fresh('items'))]);
    }

    public function destroyCartItem(Request $request, int $item): JsonResponse
    {
        $this->ensureDraftSchema();
        $owned = $this->ownedCartItem($request, $item);
        $cart = $owned->draft;
        $owned->delete();

        return response()->json(['cart' => $this->draftPayload($cart->fresh('items'))]);
    }

    public function submitDraft(Request $request, int $draft): JsonResponse
    {
        $this->ensureDraftSchema();

        return $this->submit($request, $draft, 'draft');
    }

    public function submitCart(Request $request): JsonResponse
    {
        $this->ensureDraftSchema();
        $cart = CustomerPurchaseDraft::query()->where('customer_id', $this->customerId($request))->where('kind', 'cart')->where('status', 'draft')->latest('id')->firstOrFail();

        return $this->submit($request, $cart->id, 'cart');
    }

    public function saveCartAsDraft(Request $request): JsonResponse
    {
        $this->ensureDraftSchema();
        $data = $request->validate(['title' => ['nullable', 'string', 'max:150'], 'note' => ['nullable', 'string', 'max:2000']]);
        $cart = CustomerPurchaseDraft::query()->with('items')->where('customer_id', $this->customerId($request))->where('kind', 'cart')->where('status', 'draft')->latest('id')->firstOrFail();
        abort_if($cart->items->isEmpty(), 422, 'Giỏ hàng chưa có sản phẩm để lưu bản nháp.');
        $draft = DB::transaction(function () use ($cart, $data) {
            $draft = CustomerPurchaseDraft::create(['customer_id' => $cart->customer_id, 'kind' => 'draft', 'status' => 'draft', 'title' => $data['title'] ?? 'Bản nháp từ giỏ hàng', 'note' => $data['note'] ?? null, 'idempotency_key' => (string) Str::uuid()]);
            foreach ($cart->items as $item) {
                $draft->items()->create($this->itemAttributes($item->toArray()));
            }

            return $draft->fresh('items');
        });

        return response()->json(['draft' => $this->draftPayload($draft)], 201);
    }

    public function orders(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'], 'status' => ['nullable', 'string', 'max:30'],
            'created_from' => ['nullable', 'date_format:Y-m-d'], 'created_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:created_from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        $baseQuery = $this->ordersQuery($request);
        $statusCounts = (clone $baseQuery)->selectRaw('status, COUNT(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $query = $baseQuery->latest('created_at')->latest('id');
        if ($search = trim((string) ($filters['search'] ?? ''))) {
            $query->where(fn ($q) => $q->where('order_code', 'like', '%'.$search.'%')->orWhereHas('items', fn ($i) => $i->where('product_name', 'like', '%'.$search.'%')));
        }
        if ($status = trim((string) ($filters['status'] ?? ''))) {
            $query->where('status', $status);
        }
        if ($filters['created_from'] ?? null) {
            $query->where('created_at', '>=', $filters['created_from'].' 00:00:00');
        }
        if ($filters['created_to'] ?? null) {
            $query->where('created_at', '<=', $filters['created_to'].' 23:59:59');
        }
        $orders = $query->paginate((int) ($filters['per_page'] ?? 20));

        return response()->json([
            'orders' => collect($orders->items())->map(fn ($order) => $this->orderPayload($order)),
            'pagination' => ['current_page' => $orders->currentPage(), 'last_page' => $orders->lastPage(), 'total' => $orders->total()],
            'statistics' => ['total' => (int) $statusCounts->sum(), 'by_status' => $statusCounts->map(fn ($count) => (int) $count)],
        ]);
    }

    public function dashboardAnalytics(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'months' => ['nullable', 'integer', 'in:3,6,12'],
        ]);
        $months = (int) ($filters['months'] ?? 6);
        $end = CarbonImmutable::now(config('app.timezone'))->endOfMonth();
        $start = $end->startOfMonth()->subMonths($months - 1);
        $customerId = $this->customerId($request);

        $orders = Order::query()
            ->where('customer_id', $customerId)
            ->whereBetween('created_at', [$start, $end]);

        $monthlyCounts = (clone $orders)
            ->selectRaw("DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as aggregate")
            ->groupBy('month')
            ->pluck('aggregate', 'month');

        $monthlyStatuses = (clone $orders)
            ->selectRaw("DATE_FORMAT(created_at, '%Y-%m') as month, status, COUNT(*) as aggregate")
            ->groupBy('month', 'status')
            ->get()
            ->groupBy('month');

        $statusDistribution = (clone $orders)
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        $monthlyValues = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.customer_id', $customerId)
            ->whereBetween('orders.created_at', [$start, $end])
            ->selectRaw("DATE_FORMAT(orders.created_at, '%Y-%m') as month")
            ->selectRaw("SUM(CASE WHEN order_items.note LIKE ? THEN 0 ELSE order_items.price_cny * order_items.quantity END) as known_amount", ['%Giá tham khảo: Chưa xác định%'])
            ->selectRaw("SUM(CASE WHEN order_items.note LIKE ? THEN 0 ELSE 1 END) as known_items", ['%Giá tham khảo: Chưa xác định%'])
            ->selectRaw("SUM(CASE WHEN order_items.note LIKE ? THEN 1 ELSE 0 END) as unknown_items", ['%Giá tham khảo: Chưa xác định%'])
            ->groupBy('month')
            ->get()
            ->keyBy('month');

        $monthly = collect(range(0, $months - 1))->map(function (int $offset) use ($start, $monthlyCounts, $monthlyStatuses, $monthlyValues) {
            $month = $start->addMonths($offset)->format('Y-m');
            $value = $monthlyValues->get($month);
            $knownItems = (int) ($value->known_items ?? 0);
            $unknownItems = (int) ($value->unknown_items ?? 0);
            $orderCount = (int) ($monthlyCounts[$month] ?? 0);
            $amount = $knownItems > 0
                ? number_format((float) $value->known_amount, 2, '.', '')
                : ($orderCount === 0 ? '0.00' : null);
            $byStatus = collect($monthlyStatuses->get($month, []))
                ->mapWithKeys(fn ($row) => [(string) $row->status => (int) $row->aggregate]);

            return [
                'month' => $month,
                'order_count' => $orderCount,
                'reference_value_cny' => $amount,
                'known_item_count' => $knownItems,
                'unknown_item_count' => $unknownItems,
                'reference_value_completeness' => $unknownItems > 0 ? ($knownItems > 0 ? 'partial' : 'unavailable') : 'complete',
                'by_status' => $byStatus,
            ];
        });

        return response()->json([
            'period' => ['months' => $months, 'from' => $start->toDateString(), 'to' => $end->toDateString(), 'timezone' => config('app.timezone')],
            'monthly' => $monthly,
            'status_distribution' => $statusDistribution->map(fn ($count, $status) => ['status' => (string) $status, 'count' => (int) $count])->values(),
            'totals' => [
                'orders' => (int) $statusDistribution->sum(),
                'reference_value_cny' => $monthly->contains(fn ($entry) => $entry['reference_value_cny'] !== null)
                    ? number_format((float) $monthly->sum(fn ($entry) => (float) ($entry['reference_value_cny'] ?? 0)), 2, '.', '')
                    : null,
                'known_item_count' => (int) $monthly->sum('known_item_count'),
                'unknown_item_count' => (int) $monthly->sum('unknown_item_count'),
            ],
        ]);
    }

    public function showOrder(Request $request, int $order): JsonResponse
    {
        $owned = $this->ordersQuery($request)->findOrFail($order);

        return response()->json(['order' => $this->orderPayload($owned, true)]);
    }

    public function orderHistory(Request $request, int $order): JsonResponse
    {
        $owned = $this->ordersQuery($request)->findOrFail($order);

        return response()->json(['order_id' => $owned->id, 'events' => $this->historyPayload($owned)]);
    }

    private function submit(Request $request, int $draftId, string $kind): JsonResponse
    {
        $order = DB::transaction(function () use ($request, $draftId, $kind) {
            $draft = CustomerPurchaseDraft::query()->with('items')->where('customer_id', $this->customerId($request))->where('kind', $kind)->lockForUpdate()->findOrFail($draftId);
            if ($draft->submitted_order_id) {
                return Order::with($this->orderRelations())->findOrFail($draft->submitted_order_id);
            }
            abort_unless($draft->status === 'draft', 409, 'Yêu cầu này không còn ở trạng thái bản nháp.');
            abort_if($draft->items->isEmpty(), 422, 'Hãy thêm ít nhất một sản phẩm trước khi gửi yêu cầu.');
            $order = Order::create([
                'order_code' => $this->newOrderCode(), 'customer_id' => $draft->customer_id, 'note' => $draft->note,
                'creation_source' => Order::SOURCE_CUSTOMER_PORTAL,
                'submitted_by_customer_account_id' => (int) $request->user('customer')->getAuthIdentifier(), 'submitted_at' => now(),
                'status' => 'pending', 'total_amount' => 0, 'product_total_cny' => 0, 'product_total_vnd' => 0, 'currency' => 'CNY',
                'created_by' => null, 'account_manager_id' => null,
            ]);
            foreach ($draft->items as $item) {
                $created = $order->items()->create([
                    'product_name' => $item->product_name, 'product_link' => $item->product_link,
                    'price_cny' => $item->price_cny ?? 0, 'quantity' => $item->quantity, 'note' => $this->submittedItemNote($item),
                    'product_image' => $item->product_image, 'seller' => $item->seller, 'shop_id' => $item->shop_id,
                    'shop_name' => $item->shop_name ?? $item->seller, 'size' => $item->size,
                    'color' => $item->color, 'subtotal_cny' => 0, 'subtotal_vnd' => 0, 'unit_price_vnd' => 0,
                ]);
                $this->pricing->recalculateOrderItemAmounts($created);
            }
            $this->pricing->recalculateOrderTotals($order->fresh('items'));
            $draft->update(['status' => 'submitted', 'submitted_order_id' => $order->id, 'submitted_at' => now()]);

            return $order->fresh()->load($this->orderRelations());
        }, 3);

        return response()->json(['order' => $this->orderPayload($order, true)], 201);
    }

    private function draftInput(Request $request, bool $itemsRequired = true): array
    {
        return $request->validate([
            'title' => ['nullable', 'string', 'max:150'], 'note' => ['nullable', 'string', 'max:2000'],
            'idempotency_key' => ['nullable', 'uuid'], 'items' => [$itemsRequired ? 'required' : 'sometimes', 'array', 'max:100'],
            'items.*.product_name' => ['required', 'string', 'max:255'], 'items.*.product_link' => ['nullable', 'url:http,https', 'max:4000'],
            'items.*.source' => ['nullable', 'string', 'max:30'], 'items.*.variant' => ['nullable', 'string', 'max:255'],
            'items.*.price_cny' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'], 'items.*.quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'items.*.note' => ['nullable', 'string', 'max:2000'], 'items.*.product_image' => ['nullable', 'url:http,https', 'max:4000'],
            'items.*.seller' => ['nullable', 'string', 'max:255'], 'items.*.shop_id' => ['nullable', 'string', 'max:100'],
            'items.*.shop_name' => ['nullable', 'string', 'max:255'], 'items.*.size' => ['nullable', 'string', 'max:255'], 'items.*.color' => ['nullable', 'string', 'max:255'],
            'items.*.selected_sku_id' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function validatedItem(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'product_name' => [$required, 'string', 'max:255'], 'product_link' => ['nullable', 'url:http,https', 'max:4000'],
            'source' => ['nullable', 'string', 'max:30'], 'variant' => ['nullable', 'string', 'max:255'],
            'price_cny' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'], 'quantity' => [$required, 'integer', 'min:1', 'max:100000'],
            'note' => ['nullable', 'string', 'max:2000'], 'product_image' => ['nullable', 'url:http,https', 'max:4000'],
            'seller' => ['nullable', 'string', 'max:255'], 'shop_id' => ['nullable', 'string', 'max:100'], 'shop_name' => ['nullable', 'string', 'max:255'],
            'size' => ['nullable', 'string', 'max:255'], 'color' => ['nullable', 'string', 'max:255'],
            'selected_sku_id' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function itemAttributes(array $item): array
    {
        $attributes = collect($item)->only(['source', 'product_link', 'product_name', 'variant', 'price_cny', 'quantity', 'note', 'product_image', 'seller', 'shop_id', 'shop_name', 'size', 'color'])->all();
        $skuId = trim((string) ($item['selected_sku_id'] ?? ''));
        if ($skuId !== '' && ! str_contains((string) ($attributes['note'] ?? ''), 'SKU nguồn: '.$skuId)) {
            $attributes['note'] = implode("\n", array_filter([$attributes['note'] ?? null, 'SKU nguồn: '.$skuId]));
        }

        return $attributes;
    }

    private function submittedItemNote(CustomerPurchaseDraftItem $item): ?string
    {
        $parts = [];
        if (trim((string) $item->variant) !== '') {
            $parts[] = 'Phân loại: '.trim((string) $item->variant);
        }
        if (trim((string) $item->note) !== '') {
            $parts[] = trim((string) $item->note);
        }

        return $parts === [] ? null : implode("\n", $parts);
    }

    private function ownedDraft(Request $request, int $id, ?string $kind = null): CustomerPurchaseDraft
    {
        return CustomerPurchaseDraft::query()->with('items')->where('customer_id', $this->customerId($request))->when($kind, fn ($q) => $q->where('kind', $kind))->where('status', 'draft')->findOrFail($id);
    }

    private function ownedCartItem(Request $request, int $id): CustomerPurchaseDraftItem
    {
        return CustomerPurchaseDraftItem::query()->whereHas('draft', fn ($q) => $q->where('customer_id', $this->customerId($request))->where('kind', 'cart')->where('status', 'draft'))->findOrFail($id);
    }

    private function ordersQuery(Request $request)
    {
        return Order::query()->with($this->orderRelations())->where('customer_id', $this->customerId($request));
    }

    private function orderRelations(): array
    {
        return [
            'items', 'customer', 'submittedByCustomerAccount', 'accountManager',
            'orderTrackings.packages', 'cnPackages', 'invoices', 'depositVoucher.transactions',
        ];
    }

    private function customerId(Request $request): int
    {
        return (int) $request->user('customer')->customer_id;
    }

    private function productUrlMatchesPlatform(string $url, string $platform): bool
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $domains = ['Taobao' => 'taobao.com', 'Tmall' => 'tmall.com', '1688' => '1688.com'];
        $domain = $domains[$platform] ?? null;

        return $domain !== null && ($host === $domain || str_ends_with($host, '.'.$domain));
    }

    private function ensureDraftSchema(): void
    {
        abort_unless(
            Schema::hasTable('customer_purchase_drafts') && Schema::hasTable('customer_purchase_draft_items'),
            503,
            'Giỏ hàng và bản nháp chưa được kích hoạt trên hệ thống này.'
        );
    }

    private function newOrderCode(): string
    {
        do {
            $code = 'ORD-'.now()->format('Ymd').'-'.Str::upper(Str::random(6));
        } while (Order::where('order_code', $code)->exists());

        return $code;
    }

    private function draftPayload(CustomerPurchaseDraft $draft): array
    {
        return ['id' => $draft->id, 'kind' => $draft->kind, 'status' => $draft->status, 'title' => $draft->title, 'note' => $draft->note,
            'submitted_order_id' => $draft->submitted_order_id, 'created_at' => $draft->created_at?->toISOString(), 'updated_at' => $draft->updated_at?->toISOString(),
            'items' => $draft->items->map(fn ($item) => ['id' => $item->id, 'source' => $item->source, 'product_link' => $item->product_link, 'product_name' => $item->product_name,
                'variant' => $item->variant, 'price_cny' => $item->price_cny, 'quantity' => $item->quantity, 'note' => $item->note, 'product_image' => $item->product_image,
                'seller' => $item->seller, 'shop_id' => $item->shop_id, 'shop_name' => $item->shop_name, 'size' => $item->size, 'color' => $item->color,
                'selected_sku_id' => $this->sourceSkuId($item)])->values()];
    }

    private function sourceSkuId(CustomerPurchaseDraftItem $item): ?string
    {
        foreach (Utf8ValueNormalizer::lines($item->note, 'customer_purchase_draft_items', (int) $item->id, 'note') as $line) {
            if (str_starts_with($line, 'SKU nguồn: ')) {
                return trim(substr($line, strlen('SKU nguồn: '))) ?: null;
            }
        }

        return null;
    }

    private function itemMetadata(OrderItem $item): array
    {
        $metadata = ['variant_label' => null, 'source_sku_id' => null, 'selected_attributes' => [], 'reference_price_known' => true];
        $publicLines = [];

        foreach (Utf8ValueNormalizer::lines($item->note, 'order_items', (int) $item->id, 'note') as $line) {
            if (str_starts_with($line, 'Phân loại: ')) {
                $metadata['variant_label'] = trim(substr($line, strlen('Phân loại: '))) ?: null;
            } elseif (str_starts_with($line, 'SKU nguồn: ')) {
                $metadata['source_sku_id'] = trim(substr($line, strlen('SKU nguồn: '))) ?: null;
            } elseif (str_starts_with($line, 'Thuộc tính: ')) {
                foreach (explode(' / ', substr($line, strlen('Thuộc tính: '))) as $attribute) {
                    [$name, $value] = array_pad(explode(': ', $attribute, 2), 2, null);
                    if (trim((string) $name) !== '' && trim((string) $value) !== '') {
                        $metadata['selected_attributes'][trim($name)] = trim($value);
                    }
                }
            } elseif ($line === 'Giá tham khảo: Chưa xác định') {
                $metadata['reference_price_known'] = false;
            } elseif (trim($line) !== '') {
                $publicLines[] = $line;
            }
        }

        $metadata['public_note'] = trim(implode("\n", $publicLines)) ?: null;

        return $metadata;
    }

    private function paymentPayload(Order $order): ?array
    {
        $voucher = $order->depositVoucher;
        $status = $voucher?->status ?: $order->deposit_status;
        if (! $status) {
            return null;
        }

        return [
            'status' => Utf8ValueNormalizer::string($status, 'orders', (int) $order->id, 'payment_status'),
            'requested_amount_vnd' => $voucher ? (int) round((float) $voucher->total_amount) : (int) ($order->deposit_amount_vnd ?? 0),
            'paid_amount_vnd' => $voucher ? (int) round((float) $voucher->paid_amount) : (int) ($order->deposit_paid_amount_vnd ?? 0),
            'paid_at' => $order->deposit_paid_at?->toISOString(),
        ];
    }

    private function orderPayload(Order $order, bool $detailed = false): array
    {
        $payload = ['id' => $order->id,
            'order_code' => Utf8ValueNormalizer::string($order->order_code, 'orders', (int) $order->id, 'order_code'),
            'status' => Utf8ValueNormalizer::string($order->status, 'orders', (int) $order->id, 'status'),
            'creation_source' => Utf8ValueNormalizer::string($order->creation_source, 'orders', (int) $order->id, 'creation_source'),
            'submitted_at' => $order->submitted_at?->toISOString(),
            'note' => $this->purchaseRequests->publicNote(Utf8ValueNormalizer::string($order->note, 'orders', (int) $order->id, 'note')),
            'product_total_cny' => $order->product_total_cny, 'product_total_vnd' => (int) $order->product_total_vnd,
            'exchange_rate' => $order->exchange_rate, 'currency' => Utf8ValueNormalizer::string($order->currency, 'orders', (int) $order->id, 'currency'), 'created_at' => $order->created_at?->toISOString(), 'updated_at' => $order->updated_at?->toISOString(),
            'item_count' => $order->items->count(), 'quantity' => $order->items->sum('quantity'),
            'items' => $order->items->map(function ($item) {
                $metadata = $this->itemMetadata($item);
                $referenceSubtotal = $metadata['reference_price_known']
                    ? $this->pricing->multiplyCnyByQuantity((string) $item->price_cny, (int) $item->quantity)
                    : null;

                return ['id' => $item->id,
                    'product_name' => Utf8ValueNormalizer::string($item->product_name, 'order_items', (int) $item->id, 'product_name'),
                    'product_link' => Utf8ValueNormalizer::string($item->product_link, 'order_items', (int) $item->id, 'product_link'),
                    'price_cny' => $metadata['reference_price_known'] ? $item->price_cny : null,
                    'reference_price_known' => $metadata['reference_price_known'], 'reference_subtotal_cny' => $referenceSubtotal,
                    'unit_price_vnd' => (int) $item->unit_price_vnd, 'quantity' => $item->quantity,
                    'subtotal_cny' => $item->subtotal_cny, 'subtotal_vnd' => (int) $item->subtotal_vnd,
                    'note' => $metadata['public_note'], 'product_image' => Utf8ValueNormalizer::string($item->product_image, 'order_items', (int) $item->id, 'product_image'),
                    'seller' => Utf8ValueNormalizer::string($item->seller, 'order_items', (int) $item->id, 'seller'),
                    'shop_id' => Utf8ValueNormalizer::string($item->shop_id, 'order_items', (int) $item->id, 'shop_id'),
                    'shop_name' => Utf8ValueNormalizer::string($item->shop_name, 'order_items', (int) $item->id, 'shop_name'),
                    'size' => Utf8ValueNormalizer::string($item->size, 'order_items', (int) $item->id, 'size'),
                    'color' => Utf8ValueNormalizer::string($item->color, 'order_items', (int) $item->id, 'color'),
                    'variant_label' => $metadata['variant_label'], 'source_sku_id' => $metadata['source_sku_id'],
                    'selected_attributes' => $metadata['selected_attributes']];
            })->values()];
        if ($detailed) {
            $customer = $order->customer;
            $submittedAccount = $order->submittedByCustomerAccount;
            $manager = $order->accountManager;
            $payload += [
                'history' => $this->historyPayload($order),
                'tracking_count' => $order->orderTrackings->count(), 'package_count' => $order->cnPackages->count(), 'invoice_count' => $order->invoices->count(),
                'customer_contact' => $customer ? [
                    'name' => Utf8ValueNormalizer::string($customer->name, 'customers', (int) $customer->id, 'name'),
                    'phone' => Utf8ValueNormalizer::string($customer->phone, 'customers', (int) $customer->id, 'phone'),
                    'email' => Utf8ValueNormalizer::string($customer->email, 'customers', (int) $customer->id, 'email'),
                ] : null,
                'submitted_by' => $submittedAccount ? ['id' => $submittedAccount->id,
                    'email' => Utf8ValueNormalizer::string($submittedAccount->email, 'customer_accounts', (int) $submittedAccount->id, 'email'),
                    'phone' => Utf8ValueNormalizer::string($submittedAccount->phone_e164, 'customer_accounts', (int) $submittedAccount->id, 'phone_e164')] : null,
                'account_manager' => $manager ? ['id' => $manager->id,
                    'name' => Utf8ValueNormalizer::string($manager->name, 'users', (int) $manager->id, 'name')] : null,
                'payment' => $this->paymentPayload($order),
            ];
        }

        return $payload;
    }

    private function historyPayload(Order $order): array
    {
        $events = collect([['type' => 'created', 'status' => 'pending', 'occurred_at' => $order->created_at?->toISOString()]]);
        if ($order->updated_at && ! $order->updated_at->equalTo($order->created_at)) {
            $events->push(['type' => 'order_updated', 'status' => Utf8ValueNormalizer::string($order->status, 'orders', (int) $order->id, 'status'), 'occurred_at' => $order->updated_at->toISOString()]);
        }
        foreach ($order->orderTrackings as $tracking) {
            $events->push(['type' => 'tracking', 'status' => Utf8ValueNormalizer::string($tracking->status, 'order_trackings', (int) $tracking->id, 'status'), 'occurred_at' => ($tracking->dispatched_at ?? $tracking->updated_at)?->toISOString()]);
        }
        foreach ($order->cnPackages as $package) {
            if ($package->received_at) {
                $events->push(['type' => 'cn_warehouse_received', 'status' => Utf8ValueNormalizer::string($package->status, 'cn_packages', (int) $package->id, 'status'), 'occurred_at' => $package->received_at->toISOString()]);
            }
        }
        foreach ($order->invoices as $invoice) {
            $events->push(['type' => 'invoice', 'status' => Utf8ValueNormalizer::string($invoice->status, 'invoices', (int) $invoice->id, 'status'), 'occurred_at' => $invoice->created_at?->toISOString()]);
        }

        return $events->filter(fn ($event) => $event['occurred_at'])->sortBy('occurred_at')->values()->all();
    }
}
