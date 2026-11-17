<?php

namespace App\GraphQL\Resolvers;

use App\Models\ProductLookupRequest;
use App\Support\BusinessWriteGuard;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

final class ProductLookupRequestResolver
{
    public function list($_, array $args)
    {
        return ProductLookupRequest::query()->with(['customer:id,code,name', 'staff:id,name'])
            ->when(! empty($args['status']), fn ($query) => $query->where('status', $args['status']))
            ->oldest('created_at')->limit(100)->get()->map(fn ($item) => $this->payload($item));
    }

    public function claim($_, array $args): array
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);
        $item = ProductLookupRequest::query()->findOrFail($args['id']);
        abort_unless(in_array($item->status, ['pending', 'claimed'], true), 409, 'Yêu cầu đã được xử lý.');
        if ($item->claimed_by && $item->claimed_by !== Auth::id()) {
            abort(409, 'Yêu cầu đang do nhân viên khác xử lý.');
        }
        $item->update(['claimed_by' => Auth::id(), 'claimed_at' => $item->claimed_at ?: now(), 'status' => 'claimed']);

        return $this->payload($item->fresh(['customer', 'staff']));
    }

    public function complete($_, array $args): array
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);
        $item = ProductLookupRequest::query()->findOrFail($args['id']);
        abort_unless($item->claimed_by === Auth::id(), 403, 'Bạn phải nhận xử lý yêu cầu trước khi trả kết quả.');
        $decoded = json_decode($args['product_data_json'], true);
        Validator::make(['product' => $decoded], [
            'product' => ['required', 'array'], 'product.protocol_version' => ['required', 'string', 'max:10'],
            'product.platform' => ['required', 'in:Taobao,Tmall,1688'], 'product.normalized_url' => ['required', 'url:http,https', 'max:4000'],
            'product.title' => ['nullable', 'string', 'max:500'], 'product.images' => ['array', 'max:30'], 'product.skus' => ['array', 'max:500'],
            'product.price_cny' => ['nullable', 'numeric', 'min:0'], 'product.extraction_status' => ['required', 'in:success,partial,unavailable'],
        ])->validate();
        abort_unless($decoded['platform'] === $item->platform, 422, 'Nền tảng kết quả không khớp yêu cầu.');
        $item->update(['product_data' => $decoded, 'staff_note' => $args['staff_note'] ?? null, 'status' => 'completed', 'completed_at' => now()]);

        return $this->payload($item->fresh(['customer', 'staff']));
    }

    private function payload(ProductLookupRequest $item): array
    {
        return ['id' => $item->id, 'customer_id' => $item->customer_id, 'customer_code' => $item->customer?->code, 'customer_name' => $item->customer?->name,
            'platform' => $item->platform, 'source_url' => $item->source_url, 'status' => $item->status, 'claimed_by' => $item->claimed_by,
            'staff_name' => $item->staff?->name, 'product_data_json' => $item->product_data ? json_encode($item->product_data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'staff_note' => $item->staff_note, 'created_at' => $item->created_at?->toISOString(), 'updated_at' => $item->updated_at?->toISOString()];
    }
}
