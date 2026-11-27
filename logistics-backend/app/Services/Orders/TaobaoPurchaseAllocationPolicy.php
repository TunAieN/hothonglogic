<?php

namespace App\Services\Orders;

use App\Exceptions\TaobaoPurchaseValidationException;

final class TaobaoPurchaseAllocationPolicy
{
    /** @param array<string,int> $orderedQuantities */
    public function evaluate(array $orderedQuantities, array $purchases): array
    {
        $totals = array_fill_keys(array_keys($orderedQuantities), 0);
        foreach ($purchases as $purchase) {
            $seen = [];
            foreach (($purchase['items'] ?? []) as $line) {
                $itemId = (string) ($line['order_item_id'] ?? '');
                $quantity = filter_var($line['quantity'] ?? null, FILTER_VALIDATE_INT);
                if (! array_key_exists($itemId, $orderedQuantities)) throw new TaobaoPurchaseValidationException('Sản phẩm mua không thuộc đơn VietTrung này.');
                if ($quantity === false || $quantity <= 0) throw new TaobaoPurchaseValidationException('Số lượng mua phải là số nguyên dương.');
                if (isset($seen[$itemId])) throw new TaobaoPurchaseValidationException('Một sản phẩm bị khai báo hai lần trong cùng đơn Taobao.');
                $seen[$itemId] = true;
                $totals[$itemId] += $quantity;
                if ($totals[$itemId] > $orderedQuantities[$itemId]) throw new TaobaoPurchaseValidationException('Số lượng mua vượt số lượng khách đặt.', 'PURCHASE_QUANTITY_EXCEEDED');
            }
        }
        $ordered = array_sum($orderedQuantities);
        $purchased = array_sum($totals);
        return ['totals' => $totals, 'ordered' => $ordered, 'purchased' => $purchased, 'remaining' => $ordered - $purchased, 'complete' => $ordered > 0 && $ordered === $purchased];
    }
}
