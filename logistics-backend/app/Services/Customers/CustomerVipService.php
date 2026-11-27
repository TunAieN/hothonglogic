<?php

namespace App\Services\Customers;

use App\Models\Customer;
use App\Models\CustomerVipHistory;
use App\Models\CustomerVipSpendEvent;
use App\Models\Order;
use App\Models\VipTier;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomerVipService
{
    public function defaultTier(): VipTier
    {
        $tiers = VipTier::query()->where('is_active', true)->where('is_default', true)->get();
        if ($tiers->count() !== 1) {
            throw new HttpException(422, 'Cấu hình VIP phải có đúng một hạng mặc định đang hoạt động.');
        }

        return $tiers->first();
    }

    public function attributesForNewCustomer(): array
    {
        if (! Schema::hasTable('vip_tiers') || ! Schema::hasColumn('customers', 'vip_tier_id')) {
            // Rolling deploy compatibility before the additive migration is approved/applied.
            return ['vip_group' => 'Bronze'];
        }
        $tier = $this->defaultTier();

        return ['vip_tier_id' => $tier->id, 'vip_group' => $tier->name, 'vip_qualified_spend_vnd' => 0];
    }

    public function recordOrderStatusChange(Order $order, ?string $previousStatus): void
    {
        if (! Schema::hasTable('customer_vip_spend_events') || ! Schema::hasColumn('customers', 'vip_tier_id')) {
            return;
        }
        $current = strtolower((string) $order->status);
        $previous = strtolower((string) $previousStatus);
        $complete = ['completed', 'delivered'];

        if (in_array($current, $complete, true) && ! in_array($previous, $complete, true)) {
            $this->recordOrderEvent($order, 'order_completed', max(0, (int) $order->product_total_vnd));
        } elseif (in_array($previous, $complete, true) && in_array($current, ['cancelled', 'rejected'], true)) {
            $original = CustomerVipSpendEvent::query()
                ->where(['source_type' => 'order', 'source_id' => $order->id, 'event_type' => 'order_completed'])
                ->first();
            if ($original) {
                $this->recordOrderEvent($order, 'order_cancelled_adjustment', -abs((int) $original->amount_vnd));
            }
        }
    }

    public function adjustTier(Customer $customer, VipTier $tier, string $reason): Customer
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw new HttpException(422, 'Phải nhập lý do điều chỉnh VIP.');
        }

        return DB::transaction(function () use ($customer, $tier, $reason) {
            $locked = Customer::query()->lockForUpdate()->findOrFail($customer->id);
            $from = $locked->vip_tier_id;
            $locked->forceFill(['vip_tier_id' => $tier->id, 'vip_group' => $tier->name])->save();
            CustomerVipHistory::query()->create([
                'customer_id' => $locked->id, 'from_vip_tier_id' => $from, 'to_vip_tier_id' => $tier->id,
                'change_type' => 'manual', 'qualified_spend_vnd' => (int) $locked->vip_qualified_spend_vnd,
                'reason' => $reason, 'changed_by' => Auth::id(),
            ]);

            return $locked->fresh(['vipTier', 'vipHistories']);
        }, 3);
    }

    private function recordOrderEvent(Order $order, string $eventType, int $amountVnd): void
    {
        if ($amountVnd === 0) {
            return;
        }

        DB::transaction(function () use ($order, $eventType, $amountVnd) {
            $customer = Customer::query()->lockForUpdate()->findOrFail($order->customer_id);
            try {
                CustomerVipSpendEvent::query()->create([
                    'customer_id' => $customer->id, 'source_type' => 'order', 'source_id' => $order->id,
                    'event_type' => $eventType, 'amount_vnd' => $amountVnd, 'occurred_at' => now(),
                    'metadata' => ['order_code' => $order->order_code, 'status' => $order->status, 'basis' => 'product_total_vnd'],
                    'created_by' => Auth::id(),
                ]);
            } catch (QueryException $exception) {
                if ((string) $exception->getCode() === '23000') {
                    return;
                }
                throw $exception;
            }

            $spend = max(0, (int) $customer->vip_qualified_spend_vnd + $amountVnd);
            $customer->forceFill(['vip_qualified_spend_vnd' => $spend])->save();

            $currentTier = $customer->vipTier;
            if (! $currentTier && $customer->vip_group) {
                $currentTier = VipTier::query()->where('is_active', true)->where(function ($query) use ($customer) {
                    $query->whereRaw('LOWER(name) = ?', [mb_strtolower(trim((string) $customer->vip_group))])
                        ->orWhereRaw('LOWER(code) = ?', [mb_strtolower(trim((string) $customer->vip_group))]);
                })->first();
                if ($currentTier) {
                    $customer->forceFill(['vip_tier_id' => $currentTier->id, 'vip_group' => $currentTier->name])->save();
                }
            }

            // Existing customers without an approved/mappable tier remain untouched.
            if (! $currentTier || $amountVnd < 0) {
                return;
            }
            $eligible = VipTier::query()->where('is_active', true)
                ->where('minimum_spend_vnd', '<=', $spend)->orderByDesc('minimum_spend_vnd')->orderByDesc('priority')->first();
            if (! $eligible || $eligible->priority <= $currentTier->priority) {
                return;
            }

            $customer->forceFill(['vip_tier_id' => $eligible->id, 'vip_group' => $eligible->name])->save();
            CustomerVipHistory::query()->create([
                'customer_id' => $customer->id, 'from_vip_tier_id' => $currentTier->id, 'to_vip_tier_id' => $eligible->id,
                'change_type' => 'automatic_upgrade', 'qualified_spend_vnd' => $spend,
                'reason' => 'Đạt ngưỡng chi tiêu hợp lệ từ đơn '.$order->order_code, 'changed_by' => Auth::id(),
            ]);
        }, 3);
    }
}
