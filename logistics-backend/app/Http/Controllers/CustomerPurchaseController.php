<?php

namespace App\Http\Controllers;

use App\Models\CustomerPurchaseDraft;
use App\Models\CustomerPurchaseDraftItem;
use App\Models\Order;
use App\Services\Orders\OrderPricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CustomerPurchaseController extends Controller
{
    public function __construct(private readonly OrderPricingService $pricing) {}

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
                foreach ($data['items'] as $item) $owned->items()->create($this->itemAttributes($item));
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
            foreach ($cart->items as $item) $draft->items()->create($this->itemAttributes($item->toArray()));
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
        $query = $this->ordersQuery($request)->latest('created_at')->latest('id');
        if ($search = trim((string) ($filters['search'] ?? ''))) {
            $query->where(fn ($q) => $q->where('order_code', 'like', '%'.$search.'%')->orWhereHas('items', fn ($i) => $i->where('product_name', 'like', '%'.$search.'%')));
        }
        if ($status = trim((string) ($filters['status'] ?? ''))) $query->where('status', $status);
        if ($filters['created_from'] ?? null) $query->where('created_at', '>=', $filters['created_from'].' 00:00:00');
        if ($filters['created_to'] ?? null) $query->where('created_at', '<=', $filters['created_to'].' 23:59:59');
        $orders = $query->paginate((int) ($filters['per_page'] ?? 20));
        return response()->json(['orders' => collect($orders->items())->map(fn ($order) => $this->orderPayload($order)), 'pagination' => ['current_page' => $orders->currentPage(), 'last_page' => $orders->lastPage(), 'total' => $orders->total()]]);
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
            if ($draft->submitted_order_id) return Order::with($this->orderRelations())->findOrFail($draft->submitted_order_id);
            abort_unless($draft->status === 'draft', 409, 'Yêu cầu này không còn ở trạng thái bản nháp.');
            abort_if($draft->items->isEmpty(), 422, 'Hãy thêm ít nhất một sản phẩm trước khi gửi yêu cầu.');
            $order = Order::create([
                'order_code' => $this->newOrderCode(), 'customer_id' => $draft->customer_id, 'note' => $draft->note,
                'status' => 'pending', 'total_amount' => 0, 'product_total_cny' => 0, 'product_total_vnd' => 0, 'currency' => 'CNY', 'created_by' => null,
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
        ]);
    }

    private function itemAttributes(array $item): array
    {
        return collect($item)->only(['source','product_link','product_name','variant','price_cny','quantity','note','product_image','seller','shop_id','shop_name','size','color'])->all();
    }

    private function submittedItemNote(CustomerPurchaseDraftItem $item): ?string
    {
        $parts = [];
        if (trim((string) $item->variant) !== '') $parts[] = 'Phân loại: '.trim((string) $item->variant);
        if (trim((string) $item->note) !== '') $parts[] = trim((string) $item->note);
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
        return ['items', 'orderTrackings.packages', 'cnPackages', 'invoices', 'depositVoucher.transactions'];
    }

    private function customerId(Request $request): int
    {
        return (int) $request->user('customer')->customer_id;
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
        do $code = 'ORD-'.now()->format('Ymd').'-'.Str::upper(Str::random(6)); while (Order::where('order_code', $code)->exists());
        return $code;
    }

    private function draftPayload(CustomerPurchaseDraft $draft): array
    {
        return ['id' => $draft->id, 'kind' => $draft->kind, 'status' => $draft->status, 'title' => $draft->title, 'note' => $draft->note,
            'submitted_order_id' => $draft->submitted_order_id, 'created_at' => $draft->created_at?->toISOString(), 'updated_at' => $draft->updated_at?->toISOString(),
            'items' => $draft->items->map(fn ($item) => ['id' => $item->id, 'source' => $item->source, 'product_link' => $item->product_link, 'product_name' => $item->product_name,
                'variant' => $item->variant, 'price_cny' => $item->price_cny, 'quantity' => $item->quantity, 'note' => $item->note, 'product_image' => $item->product_image,
                'seller' => $item->seller, 'shop_id' => $item->shop_id, 'shop_name' => $item->shop_name, 'size' => $item->size, 'color' => $item->color])->values()];
    }

    private function orderPayload(Order $order, bool $detailed = false): array
    {
        $payload = ['id' => $order->id, 'order_code' => $order->order_code, 'status' => $order->status, 'note' => $order->note,
            'product_total_cny' => $order->product_total_cny, 'product_total_vnd' => (int) $order->product_total_vnd,
            'exchange_rate' => $order->exchange_rate, 'currency' => $order->currency, 'created_at' => $order->created_at?->toISOString(), 'updated_at' => $order->updated_at?->toISOString(),
            'item_count' => $order->items->count(), 'quantity' => $order->items->sum('quantity'),
            'items' => $order->items->map(fn ($item) => ['id' => $item->id, 'product_name' => $item->product_name, 'product_link' => $item->product_link,
                'price_cny' => $item->price_cny, 'unit_price_vnd' => (int) $item->unit_price_vnd, 'quantity' => $item->quantity,
                'subtotal_cny' => $item->subtotal_cny, 'subtotal_vnd' => (int) $item->subtotal_vnd, 'note' => $item->note, 'product_image' => $item->product_image,
                'seller' => $item->seller, 'shop_id' => $item->shop_id, 'shop_name' => $item->shop_name, 'size' => $item->size, 'color' => $item->color])->values()];
        if ($detailed) $payload += ['history' => $this->historyPayload($order), 'tracking_count' => $order->orderTrackings->count(), 'package_count' => $order->cnPackages->count(), 'invoice_count' => $order->invoices->count()];
        return $payload;
    }

    private function historyPayload(Order $order): array
    {
        $events = collect([['type' => 'created', 'status' => 'pending', 'occurred_at' => $order->created_at?->toISOString()]]);
        if ($order->updated_at && !$order->updated_at->equalTo($order->created_at)) $events->push(['type' => 'order_updated', 'status' => $order->status, 'occurred_at' => $order->updated_at->toISOString()]);
        foreach ($order->orderTrackings as $tracking) {
            $events->push(['type' => 'tracking', 'status' => $tracking->status, 'occurred_at' => ($tracking->dispatched_at ?? $tracking->updated_at)?->toISOString()]);
        }
        foreach ($order->cnPackages as $package) {
            if ($package->received_at) $events->push(['type' => 'cn_warehouse_received', 'status' => $package->status, 'occurred_at' => $package->received_at->toISOString()]);
        }
        foreach ($order->invoices as $invoice) $events->push(['type' => 'invoice', 'status' => $invoice->status, 'occurred_at' => $invoice->created_at?->toISOString()]);
        return $events->filter(fn ($event) => $event['occurred_at'])->sortBy('occurred_at')->values()->all();
    }
}
