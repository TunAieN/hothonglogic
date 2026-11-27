<?php

namespace App\Http\Controllers;

use App\Models\CustomerBalanceLedger;
use App\Models\CustomerNotification;
use App\Models\CustomerPaymentIntent;
use App\Models\PaymentVoucher;
use App\Services\Orders\OrderPricingService;
use App\Services\Payments\CustomerFinanceService;
use App\Services\Payments\CustomerLedgerService;
use App\Services\Payments\SepayAccountRegistry;
use App\Services\Shipping\ShippingRateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CustomerFinanceController extends Controller
{
    public function __construct(
        private readonly CustomerFinanceService $finance,
        private readonly CustomerLedgerService $ledgerService,
        private readonly SepayAccountRegistry $sepayAccounts,
        private readonly OrderPricingService $pricing,
        private readonly ShippingRateService $shipping,
    ) {}

    public function summary(Request $request): JsonResponse
    {
        $customerId = $this->customerId($request);
        $paymentAccount = $this->sepayAccounts->verifiedPaymentAccount(false);
        $debt = PaymentVoucher::query()->where('customer_id', $customerId)
            ->whereIn('status', PaymentVoucher::ACTIVE_STATUSES)->get()->sum(fn ($voucher) => $this->finance->voucherRemaining($voucher));

        return response()->json([
            'balance_vnd' => $this->finance->balance($customerId),
            'outstanding_vnd' => (int) $debt,
            'sepay_available' => config('sepay.enabled') === true && $this->sepayAccounts->hasVerifiedPaymentAccount(),
            'sepay_webhook_enabled' => config('sepay.webhook_enabled') === true,
            'deposit_auto_confirmation_enabled' => config('sepay.deposit_auto_confirmation_enabled') === true,
            'direct_voucher_payment_enabled' => config('sepay.direct_voucher_payment_enabled') === true,
            'topup_rules' => [
                'min_vnd' => CustomerFinanceService::MIN_TOPUP_VND,
                'max_vnd' => CustomerFinanceService::MAX_TOPUP_VND,
                'step_vnd' => CustomerFinanceService::TOPUP_STEP_VND,
            ],
            'payment_account' => $paymentAccount ? [
                'bank_name' => $paymentAccount->bank_name,
                'bank_code' => $paymentAccount->bank_code,
                'account_number' => $paymentAccount->account_number,
                'account_holder' => $paymentAccount->account_holder,
            ] : null,
        ]);
    }

    public function intents(Request $request): JsonResponse
    {
        $data = Validator::make($request->query(), [
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'status' => ['nullable', 'in:pending,completed,expired,failed,cancelled,reconciliation_needed,confirmation_delayed'],
            'type' => ['nullable', 'in:wallet_topup,voucher_payment,wallet_voucher_payment'],
            'search' => ['nullable', 'string', 'max:100'],
            'min_amount' => ['nullable', 'integer', 'min:0'],
            'max_amount' => ['nullable', 'integer', 'min:0'],
        ])->validate();
        $query = CustomerPaymentIntent::query()
            ->where('customer_id', $this->customerId($request))
            ->with(['paymentAccount', 'webhookEvents' => fn ($events) => $events->latest('id')]);
        if (($data['status'] ?? null) === 'expired') {
            $query->where(fn ($builder) => $builder->where('status', 'expired')
                ->orWhere(fn ($pending) => $pending->where('status', 'pending')->where('expires_at', '<=', now())));
        } elseif (($data['status'] ?? null) === 'pending') {
            $query->where('status', 'pending')->where('expires_at', '>', now());
        } elseif (in_array($data['status'] ?? null, ['reconciliation_needed', 'confirmation_delayed'], true)) {
            $eventStatus = $data['status'] === 'confirmation_delayed' ? 'retryable_failed' : 'reconciliation_needed';
            $query->whereHas('webhookEvents', fn ($events) => $events->where('status', $eventStatus));
        } elseif (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }
        if (! empty($data['type'])) {
            $query->where('type', $data['type']);
        }
        if (! empty($data['search'])) {
            $query->where('reference', 'like', '%'.strtoupper(trim($data['search'])).'%');
        }
        if (array_key_exists('min_amount', $data)) {
            $query->where('amount_vnd', '>=', $data['min_amount']);
        }
        if (array_key_exists('max_amount', $data)) {
            $query->where('amount_vnd', '<=', $data['max_amount']);
        }
        $rows = $query->latest('id')->paginate($data['per_page'] ?? 20);

        return response()->json([
            'data' => collect($rows->items())->map(fn ($intent) => $this->finance->qrPayload($intent))->values(),
            'meta' => ['current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total()],
        ]);
    }

    public function ledger(Request $request): JsonResponse
    {
        $data = Validator::make($request->query(), ['page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']])->validate();
        $rows = CustomerBalanceLedger::query()->where('customer_id', $this->customerId($request))
            ->latest('id')->paginate($data['per_page'] ?? 20);

        return response()->json([
            'data' => collect($rows->items())->map(fn ($row) => [
                'id' => $row->id, 'type' => $row->type, 'amount_vnd' => $this->ledgerService->vnd($row->amount),
                'balance_after_vnd' => $this->ledgerService->vnd($row->balance_after), 'description' => $row->description,
                'payment_voucher_id' => $row->payment_voucher_id, 'created_at' => $row->created_at?->toIso8601String(),
            ])->values(),
            'meta' => ['current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total()],
        ]);
    }

    public function vouchers(Request $request): JsonResponse
    {
        $rows = PaymentVoucher::query()->where('customer_id', $this->customerId($request))
            ->with(['paymentAccount', 'order', 'transactions'])->latest('id')->paginate(min(100, max(1, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => collect($rows->items())->map(fn ($voucher) => $this->voucherPayload($voucher))->values(),
            'meta' => ['current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total()],
        ]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $customerId = $this->customerId($request);
        $rows = CustomerNotification::query()->where('customer_id', $customerId)
            ->latest('id')->paginate(min(100, max(1, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => collect($rows->items())->map(fn (CustomerNotification $notification) => [
                'id' => $notification->id,
                'type' => $notification->type,
                'title' => $notification->title,
                'body' => $notification->body,
                'action_url' => $notification->action_url,
                'sent_at' => $notification->sent_at?->toIso8601String(),
                'read_at' => $notification->read_at?->toIso8601String(),
                'created_at' => $notification->created_at?->toIso8601String(),
            ])->values(),
            'meta' => [
                'current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total(),
                'unread' => CustomerNotification::query()->where('customer_id', $customerId)->whereNull('read_at')->count(),
            ],
        ]);
    }

    public function markNotificationRead(Request $request, int $notification): JsonResponse
    {
        $row = CustomerNotification::query()->where('customer_id', $this->customerId($request))->findOrFail($notification);
        if (! $row->read_at) {
            $row->update(['read_at' => now()]);
        }

        return response()->json(['notification' => ['id' => $row->id, 'read_at' => $row->fresh()->read_at?->toIso8601String()]]);
    }

    public function markAllNotificationsRead(Request $request): JsonResponse
    {
        $count = CustomerNotification::query()->where('customer_id', $this->customerId($request))
            ->whereNull('read_at')->update(['read_at' => now(), 'updated_at' => now()]);

        return response()->json(['updated' => $count]);
    }

    public function createTopupIntent(Request $request): JsonResponse
    {
        $data = Validator::make($request->all(), [
            'amount_vnd' => ['required', 'integer', 'min:'.CustomerFinanceService::MIN_TOPUP_VND, 'max:'.CustomerFinanceService::MAX_TOPUP_VND],
            'idempotency_key' => ['required', 'string', 'max:100'],
        ])->validate();
        $intent = $this->finance->createSepayIntent($this->customerId($request), 'wallet_topup', (int) $data['amount_vnd'], $data['idempotency_key']);

        return response()->json(['intent' => $this->finance->qrPayload($intent)], 201);
    }

    public function intentStatus(Request $request, string $reference): JsonResponse
    {
        $intent = CustomerPaymentIntent::query()->where('customer_id', $this->customerId($request))->where('reference', $reference)->firstOrFail();
        if ($intent->status === 'pending' && $intent->expires_at->isPast()) {
            $intent->setAttribute('status', 'expired');
        }

        return response()->json(['intent' => $this->finance->qrPayload($intent)]);
    }

    public function createVoucherSepayIntent(Request $request, int $voucher): JsonResponse
    {
        $data = Validator::make($request->all(), ['idempotency_key' => ['required', 'string', 'max:100']])->validate();
        $owned = PaymentVoucher::query()->where('customer_id', $this->customerId($request))->findOrFail($voucher);
        $enabled = $owned->voucher_type === 'deposit'
            ? config('sepay.deposit_auto_confirmation_enabled') === true
            : config('sepay.direct_voucher_payment_enabled') === true;
        if (! $enabled) {
            throw new HttpException(503, 'Thanh toán trực tiếp qua ngân hàng đang tạm tắt.');
        }
        $amount = $this->finance->voucherRemaining($owned);
        $intent = $this->finance->createSepayIntent($this->customerId($request), 'voucher_payment', $amount, $data['idempotency_key'], $owned->id);

        return response()->json(['intent' => $this->finance->qrPayload($intent)], 201);
    }

    public function payVoucherFromWallet(Request $request, int $voucher): JsonResponse
    {
        $data = Validator::make($request->all(), ['idempotency_key' => ['required', 'string', 'max:100']])->validate();
        $intent = $this->finance->payVoucherFromWallet($this->customerId($request), $voucher, $data['idempotency_key']);

        return response()->json(['intent' => ['reference' => $intent->reference, 'status' => $intent->status, 'amount_vnd' => (int) $intent->amount_vnd]]);
    }

    public function payVouchersFromWallet(Request $request): JsonResponse
    {
        $data = Validator::make($request->all(), [
            'voucher_ids' => ['required', 'array', 'min:1', 'max:50'],
            'voucher_ids.*' => ['required', 'integer', 'distinct', 'min:1'],
            'idempotency_key' => ['required', 'string', 'max:100'],
        ])->validate();
        $intents = $this->finance->payVouchersFromWallet(
            $this->customerId($request),
            $data['voucher_ids'],
            $data['idempotency_key'],
        );

        return response()->json(['intents' => collect($intents)->map(fn ($intent) => [
            'reference' => $intent->reference,
            'status' => $intent->status,
            'amount_vnd' => (int) $intent->amount_vnd,
            'payment_voucher_id' => (int) $intent->payment_voucher_id,
        ])->values()]);
    }

    public function pricing(Request $request): JsonResponse
    {
        $rate = $this->pricing->getActiveExchangeRate();
        $customerType = $this->customerType($request);
        $shipping = $this->shipping->findActiveRate(array_filter(['customer_type' => $customerType]));

        return response()->json([
            'exchange_rate' => $rate ? ['from' => $rate->from_currency, 'to' => $rate->to_currency, 'rate' => (string) $rate->rate, 'effective_from' => $rate->effective_from?->toIso8601String()] : null,
            'shipping_rate' => $shipping ? [
                'id' => $shipping->id, 'name' => $shipping->name,
                'details' => $shipping->details->map(fn ($detail) => [
                    'min_weight' => (float) ($detail->min_weight ?? $detail->weight_from),
                    'max_weight' => ($detail->max_weight ?? $detail->weight_to) === null ? null : (float) ($detail->max_weight ?? $detail->weight_to),
                    'price_vnd' => (int) round((float) ($detail->price ?? $detail->price_per_kg)),
                    'price_type' => $detail->price_type ?: 'per_kg', 'description' => $detail->description,
                ])->values(),
            ] : null,
        ]);
    }

    public function estimate(Request $request): JsonResponse
    {
        $data = Validator::make($request->all(), [
            'product_price_cny' => ['required', 'numeric', 'min:0.01', 'max:99999999.99'],
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'weight_kg' => ['required', 'numeric', 'min:0.001', 'max:100000'],
        ])->validate();
        $rate = $this->pricing->getActiveExchangeRate();
        if (! $rate) {
            throw new HttpException(422, 'Chưa có tỷ giá CNY/VND đang hiệu lực.');
        }
        $amountCny = $this->pricing->multiplyCnyByQuantity((string) $data['product_price_cny'], (int) $data['quantity']);
        $goods = $this->pricing->convertCnyToVnd($amountCny, (string) $rate->rate);
        $shipping = $this->shipping->calculateFee((float) $data['weight_kg'], array_filter(['customer_type' => $this->customerType($request)]));

        return response()->json(['estimate' => [
            'product_total_cny' => $amountCny, 'exchange_rate' => (string) $rate->rate,
            'goods_value_vnd' => $goods, 'shipping_fee_vnd' => (int) $shipping['shipping_fee'],
            'purchase_fee_vnd' => null, 'additional_fee_vnd' => null,
            'known_total_vnd' => $goods + (int) $shipping['shipping_fee'],
            'notice' => 'Chưa gồm phí mua hộ và dịch vụ gia tăng nếu chưa có cấu hình nghiệp vụ tương ứng.',
        ]]);
    }

    private function customerId(Request $request): int
    {
        return (int) $request->user('customer')->customer_id;
    }

    private function customerType(Request $request): ?string
    {
        $value = trim((string) $request->user('customer')->customer?->vip_group);

        return $value !== '' ? $value : null;
    }

    private function voucherPayload(PaymentVoucher $voucher): array
    {
        return [
            'id' => $voucher->id, 'code' => $voucher->voucher_code, 'type' => $voucher->voucher_type,
            'status' => $voucher->status, 'total_vnd' => $this->ledgerService->vnd($voucher->getRawOriginal('total_amount')),
            'paid_vnd' => $this->ledgerService->vnd($voucher->getRawOriginal('paid_amount')),
            'remaining_vnd' => $this->finance->voucherRemaining($voucher),
            'content' => $voucher->note ?: ($voucher->order?->code ? 'Thanh toán đơn '.$voucher->order->code : null),
            'order_code' => $voucher->order?->code,
            'expires_at' => $voucher->expires_at?->toIso8601String(),
            'paid_at' => $voucher->paid_at?->toIso8601String(),
            'created_at' => $voucher->created_at?->toIso8601String(),
        ];
    }
}
