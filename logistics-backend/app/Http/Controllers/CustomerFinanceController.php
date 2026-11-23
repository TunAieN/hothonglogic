<?php

namespace App\Http\Controllers;

use App\Models\CustomerBalanceLedger;
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
        $debt = PaymentVoucher::query()->where('customer_id', $customerId)
            ->whereIn('status', PaymentVoucher::ACTIVE_STATUSES)->get()->sum(fn ($voucher) => $this->finance->voucherRemaining($voucher));

        return response()->json([
            'balance_vnd' => $this->finance->balance($customerId),
            'outstanding_vnd' => (int) $debt,
            'sepay_available' => config('sepay.enabled') === true && $this->sepayAccounts->hasVerifiedPaymentAccount(),
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
            ->with('paymentAccount')->latest('id')->paginate(min(100, max(1, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => collect($rows->items())->map(fn ($voucher) => $this->voucherPayload($voucher))->values(),
            'meta' => ['current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total()],
        ]);
    }

    public function createTopupIntent(Request $request): JsonResponse
    {
        $data = Validator::make($request->all(), [
            'amount_vnd' => ['required', 'integer', 'min:1000', 'max:999999999999'],
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
            'created_at' => $voucher->created_at?->toIso8601String(),
        ];
    }
}
