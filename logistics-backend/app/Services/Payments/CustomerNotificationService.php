<?php

namespace App\Services\Payments;

use App\Models\AuditLog;
use App\Models\CustomerNotification;
use App\Models\PaymentTransaction;
use App\Models\PaymentVoucher;
use App\Models\SepayWebhookEvent;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomerNotificationService
{
    public function depositRequested(PaymentVoucher $voucher, ?string $reference): CustomerNotification
    {
        $voucher->loadMissing('order');
        $percent = $voucher->deposit_percent === null ? null : rtrim(rtrim(number_format((float) $voucher->deposit_percent, 2, '.', ''), '0'), '.');
        $body = 'Yêu cầu đặt cọc cho đơn '.$this->orderCode($voucher)
            .($percent !== null ? ' với tỷ lệ '.$percent.'%' : '')
            .', số tiền '.number_format((int) round((float) $voucher->total_amount), 0, ',', '.').' VND.';

        return $this->create([
            'customer_id' => $voucher->customer_id,
            'order_id' => $voucher->order_id,
            'payment_voucher_id' => $voucher->id,
            'type' => 'deposit_requested',
            'title' => 'Yêu cầu đặt cọc '.$this->orderCode($voucher),
            'body' => $body,
            'action_url' => '/tai-khoan/thanh-toan-don?voucher='.$voucher->id,
            'idempotency_key' => 'deposit-requested:'.$voucher->id,
            'metadata' => ['reference' => $reference, 'amount_vnd' => (int) round((float) $voucher->total_amount)],
        ]);
    }

    public function depositPaid(PaymentVoucher $voucher, PaymentTransaction $transaction): CustomerNotification
    {
        $voucher->loadMissing('order');

        return $this->create([
            'customer_id' => $voucher->customer_id,
            'order_id' => $voucher->order_id,
            'payment_voucher_id' => $voucher->id,
            'type' => 'deposit_paid',
            'title' => 'Đặt cọc đã được xác nhận',
            'body' => 'Khoản đặt cọc '.number_format((int) round((float) $transaction->amount), 0, ',', '.').' VND cho đơn '.$this->orderCode($voucher).' đã được xác nhận.',
            'action_url' => '/tai-khoan/don-mua-ho/'.$voucher->order_id,
            'idempotency_key' => 'deposit-paid:'.$voucher->id,
            'metadata' => ['transaction_id' => $transaction->id, 'confirmation_source' => $transaction->confirmation_source],
        ]);
    }

    public function voucherPaymentRequested(PaymentVoucher $voucher, string $reference): CustomerNotification
    {
        $voucher->loadMissing('order');

        return $this->create([
            'customer_id' => $voucher->customer_id,
            'order_id' => $voucher->order_id,
            'payment_voucher_id' => $voucher->id,
            'type' => 'voucher_payment_requested',
            'title' => 'Hóa đơn '.$voucher->voucher_code.' chờ thanh toán',
            'body' => 'Số tiền cần thanh toán là '.number_format($this->remainingVnd($voucher), 0, ',', '.').' VND. Bạn có thể chọn Ví VietTrung hoặc chuyển khoản ngân hàng.',
            'action_url' => '/tai-khoan/thanh-toan-don?voucher='.$voucher->id,
            'idempotency_key' => 'voucher-payment-requested:'.$voucher->id,
            'metadata' => ['reference' => $reference, 'amount_vnd' => $this->remainingVnd($voucher)],
        ]);
    }

    public function voucherPaid(PaymentVoucher $voucher, PaymentTransaction $transaction): CustomerNotification
    {
        $voucher->loadMissing('order');

        return $this->create([
            'customer_id' => $voucher->customer_id,
            'order_id' => $voucher->order_id,
            'payment_voucher_id' => $voucher->id,
            'type' => 'voucher_paid',
            'title' => 'Thanh toán '.$voucher->voucher_code.' đã được xác nhận',
            'body' => 'Hệ thống đã xác nhận '.number_format((int) round((float) $transaction->amount), 0, ',', '.').' VND cho phiếu '.$voucher->voucher_code.'.',
            'action_url' => '/tai-khoan/thanh-toan-don?voucher='.$voucher->id,
            'idempotency_key' => 'voucher-paid:'.$voucher->id,
            'metadata' => ['transaction_id' => $transaction->id, 'confirmation_source' => $transaction->confirmation_source],
        ]);
    }

    public function depositNeedsReview(SepayWebhookEvent $event): ?CustomerNotification
    {
        return $this->voucherNeedsReview($event, true);
    }

    public function voucherNeedsReview(SepayWebhookEvent $event, bool $depositOnly = false): ?CustomerNotification
    {
        $event->loadMissing('intent.voucher.order');
        $voucher = $event->intent?->voucher;
        if (! $voucher || ($depositOnly && $voucher->voucher_type !== 'deposit')) {
            return null;
        }

        $isDeposit = $voucher->voucher_type === 'deposit';

        return $this->create([
            'customer_id' => $voucher->customer_id,
            'order_id' => $voucher->order_id,
            'payment_voucher_id' => $voucher->id,
            'type' => $isDeposit ? 'deposit_reconciliation' : 'voucher_reconciliation',
            'title' => 'Thanh toán đang cần kiểm tra',
            'body' => 'Giao dịch cho phiếu '.$voucher->voucher_code.' đã được ghi nhận nhưng chưa đủ điều kiện tự động xác nhận. Nhân viên sẽ kiểm tra.',
            'action_url' => '/tai-khoan/thanh-toan-don?voucher='.$voucher->id,
            'idempotency_key' => ($isDeposit ? 'deposit' : 'voucher').'-reconciliation:'.$event->id,
            'metadata' => ['event_id' => $event->id, 'reason' => $event->reconciliation_reason],
        ]);
    }

    public function remind(PaymentVoucher $voucher): CustomerNotification
    {
        return DB::transaction(function () use ($voucher) {
            $locked = PaymentVoucher::query()->with('order')->lockForUpdate()->findOrFail($voucher->id);
            if ($locked->voucher_type !== 'deposit' || ! in_array($locked->status, [PaymentVoucher::STATUS_WAITING_PAYMENT, PaymentVoucher::STATUS_PARTIAL_PAID], true)) {
                throw new HttpException(422, 'Phiếu không còn ở trạng thái có thể gửi nhắc thanh toán.');
            }
            $cooldown = max(5, (int) config('sepay.deposit_reminder_cooldown_minutes', 60));
            $latest = CustomerNotification::query()->where('payment_voucher_id', $locked->id)
                ->where('type', 'deposit_reminder')->lockForUpdate()->latest('id')->first();
            if ($latest?->created_at?->gt(now()->subMinutes($cooldown))) {
                throw new HttpException(429, 'Đã gửi nhắc gần đây. Vui lòng chờ trước khi gửi lại.');
            }
            $todayCount = CustomerNotification::query()->where('payment_voucher_id', $locked->id)
                ->where('type', 'deposit_reminder')->whereDate('created_at', now()->toDateString())->count();
            if ($todayCount >= max(1, (int) config('sepay.deposit_reminder_daily_limit', 3))) {
                throw new HttpException(429, 'Đã đạt giới hạn nhắc thanh toán trong ngày.');
            }
            $notification = $this->create([
                'customer_id' => $locked->customer_id,
                'order_id' => $locked->order_id,
                'payment_voucher_id' => $locked->id,
                'sent_by' => Auth::id(),
                'type' => 'deposit_reminder',
                'title' => 'Nhắc thanh toán đặt cọc',
                'body' => 'Yêu cầu đặt cọc cho đơn '.$this->orderCode($locked).' còn '
                    .number_format((int) round((float) $locked->remaining_amount), 0, ',', '.').' VND cần thanh toán.',
                'action_url' => '/tai-khoan/thanh-toan-don?voucher='.$locked->id,
                'idempotency_key' => 'deposit-reminder:'.$locked->id.':'.now()->format('YmdHi'),
                'metadata' => ['remaining_vnd' => (int) round((float) $locked->remaining_amount)],
            ]);
            $this->audit('send_deposit_payment_reminder', $locked, ['notification_id' => $notification->id]);

            return $notification;
        });
    }

    private function create(array $attributes): CustomerNotification
    {
        return CustomerNotification::query()->firstOrCreate(
            ['idempotency_key' => $attributes['idempotency_key']],
            [...$attributes, 'channel' => 'in_app', 'status' => 'sent', 'sent_at' => now()],
        );
    }

    private function orderCode(PaymentVoucher $voucher): string
    {
        return (string) ($voucher->order?->order_code ?: $voucher->voucher_code);
    }

    private function remainingVnd(PaymentVoucher $voucher): int
    {
        return max(0, (int) round((float) $voucher->total_amount) - (int) round((float) $voucher->paid_amount));
    }

    private function audit(string $action, PaymentVoucher $voucher, array $after): void
    {
        AuditLog::query()->create([
            'user_id' => Auth::id(), 'action' => $action, 'entity_type' => 'PaymentVoucher',
            'entity_id' => $voucher->id, 'before_data' => null, 'after_data' => $after,
            'ip' => request()?->ip(), 'user_agent' => request()?->userAgent(), 'created_at' => now(),
        ]);
    }
}
