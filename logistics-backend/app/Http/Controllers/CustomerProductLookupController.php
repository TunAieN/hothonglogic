<?php

namespace App\Http\Controllers;

use App\Models\ProductLookupRequest;
use App\Services\Products\ProductMetadataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

final class CustomerProductLookupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->ensureSchema();
        $items = ProductLookupRequest::query()->where('customer_id', $this->customerId($request))->latest()->limit(50)->get()->map(fn ($item) => $this->payload($item));

        return response()->json(['requests' => $items]);
    }

    public function store(Request $request, ProductMetadataService $metadata): JsonResponse
    {
        $this->ensureSchema();
        $data = $request->validate(['url' => ['required', 'string', 'max:4000']]);
        $url = $metadata->normalizeSupportedUrl($data['url']);
        $platform = str_contains(parse_url($url, PHP_URL_HOST), '1688.com') ? '1688' : (str_contains(parse_url($url, PHP_URL_HOST), 'tmall.com') ? 'Tmall' : 'Taobao');
        $existing = ProductLookupRequest::query()->where('customer_id', $this->customerId($request))->where('source_url', $url)->whereIn('status', ['pending', 'claimed'])->first();
        $item = $existing ?: ProductLookupRequest::create(['customer_id' => $this->customerId($request), 'platform' => $platform, 'source_url' => $url, 'status' => 'pending']);

        return response()->json(['request' => $this->payload($item)], $existing ? 200 : 201);
    }

    public function show(Request $request, int $lookup): JsonResponse
    {
        $this->ensureSchema();
        $item = ProductLookupRequest::query()->where('customer_id', $this->customerId($request))->findOrFail($lookup);

        return response()->json(['request' => $this->payload($item)]);
    }

    private function customerId(Request $request): int
    {
        return (int) $request->user('customer')->customer_id;
    }

    private function ensureSchema(): void
    {
        abort_unless(Schema::hasTable('product_lookup_requests'), 503, 'Hàng đợi hỗ trợ sản phẩm chưa được kích hoạt.');
    }

    private function payload(ProductLookupRequest $item): array
    {
        return ['id' => $item->id, 'platform' => $item->platform, 'source_url' => $item->source_url, 'status' => $item->status, 'product_data' => $item->product_data, 'staff_note' => $item->staff_note, 'created_at' => $item->created_at?->toISOString(), 'updated_at' => $item->updated_at?->toISOString()];
    }
}
