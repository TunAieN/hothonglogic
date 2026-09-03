<?php

namespace App\Services\Payments;

use App\Models\PaymentVoucher;
use Illuminate\Support\Collection;

class SettledPaymentSummaryService
{
    public function summarize(Collection $vouchers, float $codAmount = 0): array
    {
        $vouchers = $vouchers->filter()->unique('id')->values();
        $items = $vouchers->flatMap->items->unique('id')->values();

        return [
            'product_total' => (float) $items->where('item_type', 'order_amount')->sum('amount'),
            'weight_shipping_total' => (float) $items->where('item_type', 'weight_fee')->sum('amount'),
            'domestic_shipping_total' => (float) $items->where('item_type', 'domestic_shipping')->sum('amount'),
            'surcharge_total' => (float) $items->where('item_type', 'surcharge')->sum('amount'),
            'settled_total' => (float) $vouchers->sum('subtotal'),
            'deposit_applied' => (float) $vouchers->sum('deposit_applied'),
            'customer_credit_applied' => (float) $vouchers->sum('customer_credit_applied'),
            'payment_after_deposit' => (float) $vouchers->sum('total_amount'),
            'paid_amount' => (float) $vouchers->sum('paid_amount'),
            'cod_amount' => $codAmount,
            'remaining_amount' => (float) $vouchers->sum('remaining_amount'),
            'status' => $vouchers->isNotEmpty() && $vouchers->every(fn (PaymentVoucher $voucher) =>
                $voucher->status === PaymentVoucher::STATUS_PAID && (float) $voucher->remaining_amount <= 0)
                    ? 'paid'
                    : 'unpaid',
        ];
    }
}
