<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Support\BusinessWriteGuard;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomerPurchaseRequestService
{
    private const MARKER_PATTERN = '/^\[VT-CUSTOMER-REQUEST:([0-9a-f-]{36}):([0-9a-f]{64})\](?:\R|$)/i';

    public function __construct(private readonly OrderPricingService $pricing) {}

    public function submit(int $customerId, int $customerAccountId, array $input): array
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);
        $key = strtolower($input['idempotency_key']);
        $fingerprint = $this->fingerprint($input);
        $orderCode = 'REQ-'.strtoupper(substr(hash('sha256', $customerId.'|'.$key), 0, 20));

        $existing = Order::query()->with('items')->where('order_code', $orderCode)->first();
        if ($existing) {
            return ['order' => $this->assertSameRequest($existing, $customerId, $key, $fingerprint), 'created' => false];
        }

        $this->assertProvenanceSchemaReady();

        try {
            $order = DB::transaction(function () use ($customerId, $customerAccountId, $input, $key, $fingerprint, $orderCode) {
                $order = Order::query()->create([
                    'order_code' => $orderCode,
                    'customer_id' => $customerId,
                    'creation_source' => Order::SOURCE_CUSTOMER_PORTAL,
                    'submitted_by_customer_account_id' => $customerAccountId,
                    'submitted_at' => now(),
                    'note' => $this->storedOrderNote($key, $fingerprint, $input['note'] ?? null),
                    'status' => 'pending',
                    'total_amount' => 0,
                    'product_total_cny' => 0,
                    'product_total_vnd' => 0,
                    'currency' => 'CNY',
                    'created_by' => null,
                    'account_manager_id' => null,
                ]);

                foreach ($input['items'] as $item) {
                    $created = $order->items()->create([
                        'product_name' => trim($item['title']),
                        'product_link' => trim($item['product_url']),
                        // This is an unverified reference snapshot, never a final payable price.
                        'price_cny' => $item['reference_price_cny'] ?? 0,
                        'quantity' => (int) $item['quantity'],
                        'note' => $this->itemNote($item),
                        'product_image' => $item['main_image'] ?? null,
                        'seller' => $item['seller'] ?? null,
                        'shop_name' => $item['shop_name'] ?? ($item['seller'] ?? null),
                        'size' => $item['size'] ?? null,
                        'color' => $item['color'] ?? null,
                        'subtotal_cny' => 0,
                        'subtotal_vnd' => 0,
                        'unit_price_vnd' => 0,
                    ]);
                    $this->pricing->recalculateOrderItemAmounts($created);
                }

                return $this->pricing->recalculateOrderTotals($order->fresh('items'));
            }, 3);

            return ['order' => $order->fresh('items'), 'created' => true];
        } catch (QueryException $exception) {
            if ((string) $exception->getCode() !== '23000') {
                throw $exception;
            }
            $existing = Order::query()->with('items')->where('order_code', $orderCode)->first();
            if (! $existing) {
                throw $exception;
            }

            return ['order' => $this->assertSameRequest($existing, $customerId, $key, $fingerprint), 'created' => false];
        }
    }

    public function publicNote(?string $note): ?string
    {
        $public = preg_replace(self::MARKER_PATTERN, '', (string) $note, 1);
        $public = trim((string) $public);

        return $public !== '' ? $public : null;
    }

    private function assertProvenanceSchemaReady(): void
    {
        $createdByColumn = collect(Schema::getColumns('orders'))->firstWhere('name', 'created_by');
        $createdByAcceptsNull = (bool) ($createdByColumn['nullable'] ?? false);

        if (! $createdByAcceptsNull || ! Schema::hasColumns('orders', ['creation_source', 'submitted_by_customer_account_id', 'submitted_at'])) {
            throw new HttpException(503, 'Chức năng gửi yêu cầu mua hộ đang chờ cập nhật cấu trúc dữ liệu. Vui lòng thử lại sau.');
        }
    }

    private function assertSameRequest(Order $order, int $customerId, string $key, string $fingerprint): Order
    {
        preg_match(self::MARKER_PATTERN, (string) $order->note, $matches);
        if ((int) $order->customer_id !== $customerId || strtolower($matches[1] ?? '') !== $key || strtolower($matches[2] ?? '') !== $fingerprint) {
            throw new HttpException(409, 'Khóa gửi yêu cầu đã được sử dụng cho một nội dung khác.');
        }

        return $order;
    }

    private function storedOrderNote(string $key, string $fingerprint, mixed $note): string
    {
        return '[VT-CUSTOMER-REQUEST:'.$key.':'.$fingerprint."]\n".trim((string) ($note ?? ''));
    }

    private function fingerprint(array $input): string
    {
        $items = array_map(function (array $item) {
            $attributes = $item['selected_attributes'] ?? [];
            ksort($attributes);

            return [
                'local_item_id' => $item['local_item_id'], 'product_url' => trim($item['product_url']), 'platform' => $item['platform'],
                'title' => trim($item['title']), 'main_image' => $item['main_image'] ?? null, 'sku_id' => $item['sku_id'] ?? null,
                'selected_attributes' => $attributes, 'variant_label' => $item['variant_label'] ?? null,
                'quantity' => (int) $item['quantity'], 'reference_price_cny' => $item['reference_price_cny'] ?? null,
                'product_note' => $item['product_note'] ?? null, 'seller' => $item['seller'] ?? null,
                'shop_name' => $item['shop_name'] ?? null, 'size' => $item['size'] ?? null, 'color' => $item['color'] ?? null,
            ];
        }, $input['items']);

        return hash('sha256', json_encode(['note' => $input['note'] ?? null, 'items' => $items], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    private function itemNote(array $item): ?string
    {
        $parts = [];
        if (! empty($item['variant_label'])) {
            $parts[] = 'Phân loại: '.trim($item['variant_label']);
        }
        if (! empty($item['sku_id'])) {
            $parts[] = 'SKU nguồn: '.trim($item['sku_id']);
        }
        if (! empty($item['selected_attributes'])) {
            $parts[] = 'Thuộc tính: '.collect($item['selected_attributes'])->map(fn ($value, $name) => $name.': '.$value)->implode(' / ');
        }
        if (($item['reference_price_cny'] ?? null) === null) {
            $parts[] = 'Giá tham khảo: Chưa xác định';
        }
        if (! empty($item['product_note'])) {
            $parts[] = trim($item['product_note']);
        }

        return $parts === [] ? null : implode("\n", $parts);
    }
}
