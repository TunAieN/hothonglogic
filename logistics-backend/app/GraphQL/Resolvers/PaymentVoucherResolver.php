<?php

namespace App\GraphQL\Resolvers;

use App\Models\Order;
use App\Models\OrderDepositPolicySnapshot;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\PaymentTransaction;
use App\Models\PaymentVoucher;
use App\Services\Payments\PaymentVoucherService;
use App\Services\Payments\CustomerFinanceService;
use App\Services\Payments\CustomerNotificationService;
use App\Services\Payments\DepositPaymentAutomationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PaymentVoucherResolver
{
    public function __construct(
        private readonly PaymentVoucherService $service,
        private readonly CustomerFinanceService $finance,
        private readonly CustomerNotificationService $notifications,
        private readonly DepositPaymentAutomationService $automation,
    ) {}

    public function automation(PaymentVoucher $voucher): array
    {
        $intent = $voucher->paymentIntents()->with(['paymentAccount', 'webhookEvents'])->latest('id')->first();
        $payload = $intent ? $this->finance->qrPayload($intent) : null;
        $event = $intent?->webhookEvents->sortByDesc('id')->first();

        return [
            'enabled' => $this->automation->enabled(),
            'intent' => $payload ? [
                ...$payload,
                // CustomerFinanceService::qrPayload() is also returned by the
                // REST customer portal, so its dates are ISO-8601 strings.
                // Lighthouse's DateTime scalar expects DateTimeInterface here;
                // passing those strings makes the whole parent order query fail
                // with "Unexpected data found / Trailing data".
                'expires_at' => $intent->expires_at,
                'created_at' => $intent->created_at,
                'completed_at' => $intent->completed_at,
                'bank_name' => $payload['bank']['name'] ?? null,
                'bank_code' => $payload['bank']['code'] ?? null,
                'account_number' => $payload['bank']['account_number'] ?? null,
                'account_holder' => $payload['bank']['account_holder'] ?? null,
            ] : null,
            'latest_event' => $event ? [
                'provider_transaction_id' => $event->provider_transaction_id,
                'status' => $event->status,
                'reconciliation_reason' => $event->reconciliation_reason,
                'amount_vnd' => $event->amount_vnd,
                'occurred_at' => $event->occurred_at,
                'processed_at' => $event->processed_at,
            ] : null,
            'notifications' => $voucher->customerNotifications()->latest('id')->limit(50)->get(),
        ];
    }

    public function eligiblePackages($_, array $args)
    {
        return $this->service->eligiblePackages($args['filter'] ?? []);
    }

    public function preview($_, array $args): array
    {
        return $this->service->preview($args['input'] ?? []);
    }

    public function defaultPaymentAccount()
    {
        return $this->service->defaultPaymentAccount();
    }

    public function list($_, array $args)
    {
        $filter = $args['filter'] ?? [];

        return PaymentVoucher::query()
            ->with(['customer', 'creator', 'warehouse'])
            ->when($filter['customer_id'] ?? null, fn ($query, $value) => $query->where('customer_id', $value))
            ->when($filter['status'] ?? null, fn ($query, $value) => $query->where('status', $value))
            ->when($filter['voucher_code'] ?? null, fn ($query, $value) => $query->where('voucher_code', 'like', '%'.trim($value).'%'))
            ->when($filter['created_by'] ?? null, fn ($query, $value) => $query->where('created_by', $value))
            ->when($filter['created_from'] ?? null, fn ($query, $value) => $query->whereDate('created_at', '>=', $value))
            ->when($filter['created_to'] ?? null, fn ($query, $value) => $query->whereDate('created_at', '<=', $value))
            ->orderByDesc('created_at');
    }

    public function show($_, array $args)
    {
        return PaymentVoucher::query()
            ->with($this->service->voucherRelations())
            ->findOrFail($args['id']);
    }

    public function transactions($_, array $args)
    {
        return PaymentTransaction::query()
            ->where('payment_voucher_id', $args['payment_voucher_id'])
            ->orderByDesc('received_at')
            ->get();
    }

    public function invoice($_, array $args)
    {
        return Invoice::query()
            ->with('items')
            ->where('payment_voucher_id', $args['payment_voucher_id'])
            ->first();
    }

    public function auditLogs($_, array $args)
    {
        return AuditLog::query()
            ->where('entity_type', 'PaymentVoucher')
            ->where('entity_id', $args['payment_voucher_id'])
            ->orderByDesc('created_at')
            ->get();
    }

    public function create($_, array $args)
    {
        return $this->service->create($args['input'] ?? []);
    }

    public function createDeposit($_, array $args)
    {
        if (Schema::hasTable('order_deposit_policy_snapshots')) {
            $order = Order::query()->findOrFail($args['order_id']);
            if ((string) $order->status === 'pending' && ! OrderDepositPolicySnapshot::query()->where('order_id', $order->id)->exists()) {
                throw new HttpException(422, 'Phải đánh giá rủi ro trước khi phát hành phiếu đặt cọc.');
            }
        }

        return $this->service->createDepositVoucher($args['order_id'], $args['deposit_percent'] ?? null);
    }

    public function confirmTransaction($_, array $args)
    {
        return $this->service->confirmTransaction($args['payment_voucher_id'], $args['input'] ?? []);
    }

    public function sendReminder($_, array $args)
    {
        $voucher = PaymentVoucher::query()->findOrFail($args['payment_voucher_id']);

        return $this->notifications->remind($voucher);
    }

    public function cancel($_, array $args)
    {
        return $this->service->cancel($args['id'], $args['reason'] ?? '');
    }

    public function issueInvoice($_, array $args)
    {
        return DB::transaction(fn () => $this->service->issueInvoice($args['payment_voucher_id']));
    }
}
