<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\OrderDepositPolicySnapshot;
use App\Models\RiskDepositPolicy;
use App\Models\AuditLog;
use App\Services\Auth\PermissionService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OrderDepositPolicyService
{
    private const CURRENT_FALLBACK_PERCENT = 70.0;

    public function __construct(
        private readonly PermissionService $permissions,
        private readonly OrderPricingService $pricing,
    ) {}

    /**
     * Build a read-only explanation for the confirmation modal.
     *
     * This method deliberately does not lock the exchange rate, persist a policy
     * snapshot, or mutate the order. The definitive values are recalculated by
     * assess() inside the confirmation transaction.
     */
    public function preview(Order $order, ?string $riskCode = null): array
    {
        $order->loadMissing(['items', 'customer.vipTier']);
        $tier = $order->customer?->vipTier;
        $riskCode = strtolower(trim((string) $riskCode));
        $risk = $riskCode === ''
            ? null
            : RiskDepositPolicy::query()->where('code', $riskCode)->where('is_active', true)->first();
        if ($riskCode !== '' && ! $risk) {
            throw new HttpException(422, 'Mức rủi ro không hợp lệ hoặc đã ngừng áp dụng.');
        }

        $rateLocked = (bool) $order->exchange_rate_locked_at;
        $exchangeRate = $rateLocked
            ? (float) $order->exchange_rate
            : (float) ($this->pricing->getActiveExchangeRate()?->rate ?? 0);
        $totals = $exchangeRate > 0
            ? $this->pricing->orderProductTotals($order, (string) $exchangeRate)
            : ['product_total_cny' => $this->pricing->orderProductTotals($order)['product_total_cny'], 'product_total_vnd' => 0];
        $baseAmountVnd = (int) $totals['product_total_vnd'];
        $breakdown = $this->resolveBreakdown($tier, $risk, $baseAmountVnd);
        $canCalculate = $order->items->isNotEmpty() && (float) $totals['product_total_cny'] > 0 && $exchangeRate > 0 && $baseAmountVnd > 0;
        if (! $breakdown['policy_configuration_valid']) {
            $canCalculate = false;
        }

        $calculationMessage = match (true) {
            $order->items->isEmpty() => 'Đơn hàng chưa có sản phẩm.',
            (float) $totals['product_total_cny'] <= 0 => 'Giá trị sản phẩm CNY chưa hợp lệ.',
            $exchangeRate <= 0 => 'Chưa cấu hình tỷ giá CNY/VND đang hoạt động.',
            $baseAmountVnd <= 0 => 'Chưa đủ dữ liệu để tính giá trị đơn bằng VND.',
            ! $breakdown['policy_configuration_valid'] => 'Chính sách VIP đã bật nhưng mức phụ thêm của rủi ro chưa được cấu hình hoặc chưa chọn mức rủi ro.',
            $rateLocked => 'Tỷ giá và giá trị VND đã được khóa cho đơn hàng.',
            default => 'Số tiền đang được xem trước theo tỷ giá hiện hành; tỷ giá sẽ được khóa khi xác nhận.',
        };

        return [
            'vip_code' => $tier?->code,
            'vip_name' => $tier?->name,
            'qualified_spend_vnd' => (int) ($order->customer?->vip_qualified_spend_vnd ?? 0),
            'vip_policy_enabled' => (bool) ($tier?->deposit_policy_enabled ?? false),
            'vip_proposed_percent' => $tier?->base_deposit_percent === null ? null : (float) $tier->base_deposit_percent,
            'vip_effective_percent' => $breakdown['vip_floor'],
            'risk_code' => $risk?->code,
            'risk_name' => $risk?->name,
            'risk_minimum_percent' => $breakdown['risk_floor'],
            'risk_surcharge_percent' => $breakdown['risk_surcharge'],
            'additive_percent' => $breakdown['additive_percent'],
            'risk_requires_manager_approval' => (bool) ($risk?->requires_manager_approval ?? false),
            'capital_minimum_percent' => $breakdown['capital_floor'],
            'recommended_percent' => $breakdown['recommended'],
            'fallback_percent' => self::CURRENT_FALLBACK_PERCENT,
            'fallback_applied' => $breakdown['configured_floors'] === [],
            'policy_formula' => $breakdown['policy_formula'],
            'policy_configuration_valid' => $breakdown['policy_configuration_valid'],
            'product_total_cny' => (float) $totals['product_total_cny'],
            'exchange_rate' => $exchangeRate > 0 ? $exchangeRate : null,
            'exchange_rate_locked' => $rateLocked,
            'product_total_vnd' => $baseAmountVnd,
            'deposit_amount_vnd' => $canCalculate ? (int) round($baseAmountVnd * $breakdown['recommended'] / 100) : null,
            'can_calculate' => $canCalculate,
            'calculation_message' => $calculationMessage,
            'can_approve_exception' => $this->permissions->allows(Auth::user(), 'deposit_exceptions.approve'),
        ];
    }

    public function assess(Order $order, array $input): OrderDepositPolicySnapshot
    {
        $riskCode = strtolower(trim((string) ($input['risk_level'] ?? '')));
        $riskReason = trim((string) ($input['risk_reason'] ?? ''));
        if ($riskCode === '' || mb_strlen($riskReason) < 10) {
            throw new HttpException(422, 'Phải chọn mức rủi ro và nhập lý do đánh giá.');
        }

        $risk = RiskDepositPolicy::query()->where('code', $riskCode)->where('is_active', true)->first();
        if (! $risk) {
            throw new HttpException(422, 'Mức rủi ro không hợp lệ hoặc đã ngừng áp dụng.');
        }
        if (! $order->exchange_rate_locked_at || (int) $order->product_total_vnd <= 0) {
            throw new HttpException(422, 'Chưa thể đánh giá cọc vì giá trị VND chưa được khóa.');
        }

        $order->loadMissing('customer.vipTier');
        $tier = $order->customer?->vipTier;
        $breakdown = $this->resolveBreakdown($tier, $risk, (int) $order->product_total_vnd);
        $vipFloor = $breakdown['vip_floor'];
        $riskFloor = $breakdown['risk_floor'];
        $capitalFloor = $breakdown['capital_floor'];
        $recommended = $breakdown['recommended'];
        if (! $breakdown['policy_configuration_valid']) {
            throw new HttpException(422, 'Chính sách VIP đã bật nhưng phụ thêm rủi ro chưa được cấu hình hợp lệ.');
        }
        $riskEvidence = $this->normalizeEvidence($input['risk_evidence'] ?? []);
        if ($risk->code === 'low' && (! $riskEvidence['seller_checked'] || ! $riskEvidence['product_checked'] || ! $riskEvidence['anomaly_checked'])) {
            throw new HttpException(422, 'Rủi ro Thấp chỉ được xác nhận sau khi đã kiểm tra shop, sản phẩm và dấu hiệu bất thường.');
        }
        $waived = (bool) ($input['waive_deposit'] ?? false);
        if (! $waived && array_key_exists('deposit_percent', $input) && abs(round((float) $input['deposit_percent'], 2) - $recommended) > 0.001) {
            throw new HttpException(422, 'Tỷ lệ xem trước đã thay đổi. Vui lòng tải lại breakdown trước khi xác nhận.');
        }
        $requested = $waived ? 0.0 : $recommended;
        if ($requested < 0 || $requested > 100 || (! $waived && $requested <= 0)) {
            throw new HttpException(422, 'Tỷ lệ đặt cọc phải lớn hơn 0 và không vượt quá 100%.');
        }

        $isException = $waived || $risk->requires_manager_approval;
        $exceptionReason = trim((string) ($input['exception_reason'] ?? ''));
        if ($isException) {
            $this->permissions->authorize(Auth::user(), 'deposit_exceptions.approve');
            if ($exceptionReason === '') {
                throw new HttpException(422, 'Ngoại lệ đặt cọc phải có lý do phê duyệt.');
            }
        }

        return DB::transaction(function () use ($order, $risk, $riskReason, $riskEvidence, $tier, $vipFloor, $riskFloor, $capitalFloor, $breakdown, $recommended, $requested, $waived, $isException, $exceptionReason) {
            $existing = OrderDepositPolicySnapshot::query()->where('order_id', $order->id)->lockForUpdate()->first();
            if ($existing?->voucher_issued_at) {
                return $existing;
            }
            $values = [
                'order_id' => $order->id, 'customer_id' => $order->customer_id, 'vip_tier_id' => $tier?->id,
                'vip_code' => $tier?->code, 'vip_name' => $tier?->name,
                'qualified_spend_vnd' => (int) ($order->customer?->vip_qualified_spend_vnd ?? 0), 'vip_deposit_percent' => $vipFloor,
                'risk_deposit_policy_id' => $risk->id, 'risk_code' => $risk->code, 'risk_name' => $risk->name,
                'risk_reason' => $riskReason, 'risk_minimum_percent' => $riskFloor, 'capital_minimum_percent' => $capitalFloor,
                'base_amount_vnd' => (int) $order->product_total_vnd, 'recommended_percent' => $recommended,
                'final_percent' => $requested, 'deposit_waived' => $waived, 'is_exception' => $isException,
                'exception_reason' => $isException ? $exceptionReason : null, 'assessed_by' => Auth::id(),
                'approved_by' => $isException ? Auth::id() : null, 'assessed_at' => now(), 'approved_at' => $isException ? now() : null,
            ];
            if (Schema::hasColumn('order_deposit_policy_snapshots', 'risk_surcharge_percent')) {
                $values += [
                    'risk_surcharge_percent' => $breakdown['risk_surcharge'],
                    'additive_percent' => $breakdown['additive_percent'],
                    'policy_formula' => $breakdown['policy_formula'],
                    'policy_version' => 'vip-risk-additive-v1',
                    'automatic_risk_code' => null,
                    'automatic_risk_reason' => 'Chưa đủ dữ liệu đáng tin cậy để đề xuất tự động.',
                    'risk_selection_source' => 'manual',
                    'risk_evidence' => $riskEvidence,
                ];
            }

            $before = $existing?->toArray();

            if ($existing) {
                $existing->update($values);
                $snapshot = $existing->fresh();
            } else {
                $snapshot = OrderDepositPolicySnapshot::query()->create($values);
            }

            AuditLog::query()->create([
                'user_id' => Auth::id(),
                'action' => 'assess_order_deposit_policy',
                'entity_type' => 'OrderDepositPolicySnapshot',
                'entity_id' => $snapshot->id,
                'before_data' => $before,
                'after_data' => $snapshot->toArray(),
                'ip' => request()?->ip(),
                'user_agent' => request()?->userAgent(),
                'created_at' => now(),
            ]);

            return $snapshot;
        }, 3);
    }

    public function markVoucherIssued(Order $order): void
    {
        if (Schema::hasTable('order_deposit_policy_snapshots')) {
            OrderDepositPolicySnapshot::query()->where('order_id', $order->id)->whereNull('voucher_issued_at')->update(['voucher_issued_at' => now()]);
        }
    }

    private function resolveBreakdown(mixed $tier, ?RiskDepositPolicy $risk, int $baseAmountVnd): array
    {
        $vipFloor = $tier?->deposit_policy_enabled && $tier?->base_deposit_percent !== null
            ? (float) $tier->base_deposit_percent
            : null;
        $vipPolicyEnabled = (bool) ($tier?->deposit_policy_enabled ?? false);
        $riskFloor = $risk?->minimum_deposit_percent === null
            ? null
            : (float) $risk->minimum_deposit_percent;
        $riskSurcharge = $risk?->surcharge_percent === null
            ? null
            : (float) $risk->surcharge_percent;
        $additivePercent = $vipPolicyEnabled && $vipFloor !== null && $riskSurcharge !== null
            ? min(100.0, round($vipFloor + $riskSurcharge, 2))
            : null;
        $capitalFloor = null;
        if ($tier?->credit_limit_vnd !== null && $baseAmountVnd > 0) {
            $capitalFloor = max(0, min(100, ceil((1 - ((int) $tier->credit_limit_vnd / $baseAmountVnd)) * 10000) / 100));
        }
        $configuredFloors = array_values(array_filter(
            [$additivePercent, $riskFloor, $capitalFloor],
            fn ($value) => $value !== null,
        ));
        $policyConfigurationValid = ! $vipPolicyEnabled || ($vipFloor !== null && $risk !== null && $riskSurcharge !== null);

        return [
            'vip_floor' => $vipFloor,
            'risk_floor' => $riskFloor,
            'risk_surcharge' => $riskSurcharge,
            'additive_percent' => $additivePercent,
            'capital_floor' => $capitalFloor,
            'configured_floors' => $configuredFloors,
            'recommended' => $configuredFloors === [] ? self::CURRENT_FALLBACK_PERCENT : max($configuredFloors),
            'policy_formula' => $vipPolicyEnabled ? 'vip_plus_risk_surcharge_with_floors' : 'current_fallback_with_floors',
            'policy_configuration_valid' => $policyConfigurationValid,
        ];
    }

    private function normalizeEvidence(mixed $evidence): array
    {
        $evidence = is_array($evidence) ? $evidence : [];

        return [
            'seller_checked' => (bool) ($evidence['seller_checked'] ?? false),
            'product_checked' => (bool) ($evidence['product_checked'] ?? false),
            'returns_checked' => (bool) ($evidence['returns_checked'] ?? false),
            'anomaly_checked' => (bool) ($evidence['anomaly_checked'] ?? false),
        ];
    }
}
