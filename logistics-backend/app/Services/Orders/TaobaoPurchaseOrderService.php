<?php

namespace App\Services\Orders;

use App\Exceptions\TaobaoPurchaseValidationException;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\TaobaoPurchaseOrder;
use App\Support\BusinessWriteGuard;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

final class TaobaoPurchaseOrderService
{
    public function __construct(private readonly TaobaoPurchaseAllocationPolicy $allocationPolicy) {}

    public function progress(int $orderId): array
    {
        $order = Order::query()->with(['items', 'taobaoPurchaseOrders.items.orderItem', 'taobaoPurchaseOrders.trackings'])->findOrFail($orderId);
        return $this->buildProgress($order);
    }

    public function save(int $orderId, array $input, int $userId, bool $confirm = false): array
    {
        BusinessWriteGuard::assertEnabled(__METHOD__);

        return DB::transaction(function () use ($orderId, $input, $userId, $confirm) {
            $order = Order::query()->lockForUpdate()->with('items')->findOrFail($orderId);
            if ((string) $order->status !== 'purchasing') {
                throw new TaobaoPurchaseValidationException('Chỉ có thể ghi nhận mua hàng khi đơn đang ở trạng thái Đang đặt hàng.', 'ORDER_NOT_PURCHASING');
            }

            TaobaoPurchaseOrder::query()->where('order_id', $order->id)->lockForUpdate()->get();
            $purchases = $this->validatePayload($order, $input['purchases'] ?? []);
            $existing = TaobaoPurchaseOrder::query()->where('order_id', $order->id)->with('items')->withCount('trackings')->get()->keyBy(fn ($row) => (string) $row->id);
            $existingByCode = $existing->keyBy(fn ($row) => mb_strtolower((string) $row->external_order_code));
            $keptIds = [];

            foreach ($purchases as $purchase) {
                $model = isset($purchase['id'])
                    ? $existing->get((string) $purchase['id'])
                    : $existingByCode->get(mb_strtolower($purchase['external_order_code']));
                if (isset($purchase['id']) && ! $model) {
                    throw new TaobaoPurchaseValidationException('Đơn mua Taobao không thuộc đơn VietTrung này.');
                }
                $codeOwner = $existingByCode->get(mb_strtolower($purchase['external_order_code']));
                if ($model && $codeOwner && (string) $model->id !== (string) $codeOwner->id) {
                    throw new TaobaoPurchaseValidationException('Mã đơn Taobao đã thuộc một bản ghi mua khác trong đơn này.', 'DUPLICATE_PURCHASE_CODE');
                }
                if ($model && ((int) $model->trackings_count > 0 || $model->status === 'confirmed')) {
                    $immutableChanged = $model->external_order_code !== $purchase['external_order_code'];
                    if ($immutableChanged) {
                        throw new TaobaoPurchaseValidationException('Không thể đổi mã đơn Taobao đã xác nhận hoặc đã liên kết vận đơn.');
                    }
                }

                $before = $model?->toArray();
                $model ??= new TaobaoPurchaseOrder(['order_id' => $order->id, 'created_by' => $userId]);
                $model->fill([
                    'platform' => 'taobao', 'external_order_code' => $purchase['external_order_code'],
                    'shop_id' => $purchase['shop_id'], 'shop_name' => $purchase['shop_name'],
                    'purchased_at' => $purchase['purchased_at'], 'note' => $purchase['note'],
                    'shop_exception_reason' => $purchase['shop_exception_reason'], 'updated_by' => $userId,
                ]);
                $model->save();
                $model->items()->delete();
                foreach ($purchase['items'] as $item) {
                    $model->items()->create(['order_item_id' => $item['order_item_id'], 'quantity' => $item['quantity']]);
                }
                $keptIds[] = (string) $model->id;
                $this->audit($userId, $before ? 'taobao_purchase_updated' : 'taobao_purchase_created', $model, $before);
            }

            foreach ($existing as $id => $model) {
                if (in_array((string) $id, $keptIds, true)) continue;
                if ((int) $model->trackings_count > 0 || $model->status === 'confirmed') {
                    throw new TaobaoPurchaseValidationException('Không thể xóa đơn mua đã xác nhận hoặc đã liên kết vận đơn.');
                }
                $before = $model->toArray();
                $model->delete();
                $this->audit($userId, 'taobao_purchase_deleted', $model, $before);
            }

            $order->load(['items', 'taobaoPurchaseOrders.items.orderItem', 'taobaoPurchaseOrders.trackings']);
            $progress = $this->buildProgress($order);
            if ($confirm) {
                if ($progress['purchase_order_count'] < 1 || $progress['remaining_quantity'] !== 0) {
                    throw new TaobaoPurchaseValidationException("Đã ghi nhận mua {$progress['purchased_quantity']}/{$progress['ordered_quantity']} sản phẩm. Còn {$progress['remaining_quantity']} sản phẩm chưa được đặt.", 'PURCHASE_INCOMPLETE');
                }
                TaobaoPurchaseOrder::query()->where('order_id', $order->id)->update(['status' => 'confirmed', 'confirmed_by' => $userId, 'confirmed_at' => now(), 'updated_by' => $userId]);
                $order->update(['status' => 'awaiting_tracking']);
                $this->audit($userId, 'taobao_purchase_completed', $order, ['status' => 'purchasing']);
                $order->refresh()->load(['items', 'taobaoPurchaseOrders.items.orderItem', 'taobaoPurchaseOrders.trackings']);
                $progress = $this->buildProgress($order);
            }
            return $progress;
        }, 3);
    }

    private function validatePayload(Order $order, array $purchases): array
    {
        $orderItems = $order->items->keyBy(fn ($item) => (string) $item->id);
        $this->allocationPolicy->evaluate(
            $orderItems->mapWithKeys(fn ($item) => [(string) $item->id => (int) $item->quantity])->all(),
            $purchases,
        );
        $totals = [];
        $codes = [];
        $purchaseIds = [];
        $normalized = [];
        foreach ($purchases as $purchase) {
            if (isset($purchase['id'])) {
                $purchaseId = (string) $purchase['id'];
                if (isset($purchaseIds[$purchaseId])) throw new TaobaoPurchaseValidationException('Một đơn mua đã lưu bị gửi lặp trong cùng yêu cầu.');
                $purchaseIds[$purchaseId] = true;
            }
            $code = trim((string) ($purchase['external_order_code'] ?? ''));
            if ($code === '' || mb_strlen($code) > 191) throw new TaobaoPurchaseValidationException('Mỗi đơn mua phải có mã Taobao hợp lệ (tối đa 191 ký tự).');
            $codeKey = mb_strtolower($code);
            if (isset($codes[$codeKey])) throw new TaobaoPurchaseValidationException("Mã đơn Taobao {$code} bị lặp trong cùng đơn.", 'DUPLICATE_PURCHASE_CODE');
            $codes[$codeKey] = true;
            // The indexed range lock also serializes concurrent declarations of a
            // previously unseen code without forcing an unverified global unique key.
            $conflict = TaobaoPurchaseOrder::query()
                ->where('external_order_code', $code)
                ->where('order_id', '<>', $order->id)
                ->lockForUpdate()
                ->first();
            if ($conflict) throw new TaobaoPurchaseValidationException("Mã đơn Taobao {$code} đã được khai báo ở đơn VietTrung khác; cần xác minh.", 'CROSS_ORDER_CODE_CONFLICT');
            $lines = $purchase['items'] ?? [];
            if (! is_array($lines) || count($lines) === 0) throw new TaobaoPurchaseValidationException("Đơn Taobao {$code} phải có ít nhất một sản phẩm.");
            $lineIds = [];
            $shopId = isset($purchase['shop_id']) ? trim((string) $purchase['shop_id']) : null;
            $shopName = isset($purchase['shop_name']) ? trim((string) $purchase['shop_name']) : null;
            $shopException = isset($purchase['shop_exception_reason']) ? trim((string) $purchase['shop_exception_reason']) : null;
            if (empty($purchase['purchased_at'])) throw new TaobaoPurchaseValidationException("Đơn Taobao {$code} cần có thời điểm đặt mua thực tế.");
            try {
                $purchasedAt = Carbon::parse((string) $purchase['purchased_at']);
            } catch (\Throwable) {
                throw new TaobaoPurchaseValidationException("Thời điểm đặt mua của đơn Taobao {$code} không hợp lệ.");
            }
            $normalizedLines = [];
            foreach ($lines as $line) {
                $itemId = (string) ($line['order_item_id'] ?? '');
                $quantity = filter_var($line['quantity'] ?? null, FILTER_VALIDATE_INT);
                if (! $orderItems->has($itemId)) throw new TaobaoPurchaseValidationException('Sản phẩm mua không thuộc đơn VietTrung này.');
                if ($quantity === false || $quantity <= 0) throw new TaobaoPurchaseValidationException('Số lượng mua phải là số nguyên dương.');
                if (isset($lineIds[$itemId])) throw new TaobaoPurchaseValidationException('Một sản phẩm bị khai báo hai lần trong cùng đơn Taobao.');
                $lineIds[$itemId] = true;
                $source = $orderItems->get($itemId);
                $sourceShop = trim((string) ($source->shop_id ?: $source->shop_name ?: $source->seller));
                $chosenShop = trim((string) ($shopId ?: $shopName));
                if ($sourceShop !== '' && $chosenShop !== '' && mb_strtolower($sourceShop) !== mb_strtolower($chosenShop) && $shopException === '') {
                    throw new TaobaoPurchaseValidationException("Sản phẩm {$source->product_name} khác shop đã chọn; cần nhập lý do ngoại lệ.", 'SHOP_MISMATCH');
                }
                $totals[$itemId] = ($totals[$itemId] ?? 0) + $quantity;
                if ($totals[$itemId] > (int) $source->quantity) throw new TaobaoPurchaseValidationException("Số lượng mua của {$source->product_name} vượt số lượng khách đặt.", 'PURCHASE_QUANTITY_EXCEEDED');
                $normalizedLines[] = ['order_item_id' => (int) $itemId, 'quantity' => $quantity];
            }
            $normalized[] = ['id' => isset($purchase['id']) ? (int) $purchase['id'] : null, 'external_order_code' => $code, 'shop_id' => $shopId ?: null, 'shop_name' => $shopName ?: null, 'purchased_at' => $purchasedAt, 'note' => isset($purchase['note']) ? trim((string) $purchase['note']) ?: null : null, 'shop_exception_reason' => $shopException ?: null, 'items' => $normalizedLines];
        }
        return $normalized;
    }

    private function buildProgress(Order $order): array
    {
        $purchased = [];
        foreach ($order->taobaoPurchaseOrders as $purchase) foreach ($purchase->items as $line) $purchased[(string) $line->order_item_id] = ($purchased[(string) $line->order_item_id] ?? 0) + (int) $line->quantity;
        $ordered = $order->items->sum(fn ($item) => (int) $item->quantity);
        $bought = array_sum($purchased);
        return ['order_id' => (string) $order->id, 'order_status' => (string) $order->status, 'ordered_quantity' => $ordered, 'purchased_quantity' => $bought, 'remaining_quantity' => max(0, $ordered - $bought), 'purchase_order_count' => $order->taobaoPurchaseOrders->count(), 'is_complete' => $ordered > 0 && $ordered === $bought, 'purchases' => $order->taobaoPurchaseOrders->values()->all()];
    }

    private function audit(int $userId, string $action, $entity, ?array $before): void
    {
        $after = $entity->exists
            ? ($entity instanceof TaobaoPurchaseOrder ? $entity->load('items')->toArray() : $entity->toArray())
            : null;
        AuditLog::create(['user_id' => $userId, 'action' => $action, 'entity_type' => $entity::class, 'entity_id' => (string) $entity->getKey(), 'before_data' => $before, 'after_data' => $after, 'ip' => request()?->ip(), 'user_agent' => request()?->userAgent(), 'created_at' => now()]);
    }
}
