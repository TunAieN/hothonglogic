<?php

namespace App\Services\Payments;

use App\Models\AuditLog;
use App\Models\CustomerBalanceLedger;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Order;
use App\Models\PaymentAccount;
use App\Models\PaymentTransaction;
use App\Models\PaymentVoucher;
use App\Models\PaymentVoucherItem;
use App\Models\PaymentVoucherPackage;
use App\Models\VnPackage;
use App\Services\Auth\PermissionService;
use App\Services\Customers\CustomerAddressService;
use App\Services\Delivery\DeliveryRequestService;
use App\Services\Orders\OrderPricingService;
use App\Services\Shipping\GhnInsuranceValueService;
use App\Services\Shipping\GhnService;
use App\Services\Shipping\ShippingRateService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PaymentVoucherService
{
    public function __construct(
        private readonly ShippingRateService $shippingRateService,
        private readonly DeliveryRequestService $deliveryRequestService,
        private readonly GhnService $ghnService,
        private readonly CustomerAddressService $customerAddressService,
        private readonly GhnInsuranceValueService $ghnInsuranceValueService,
    ) {}

    public function eligiblePackages(array $filter = [])
    {
        return VnPackage::query()
            ->with(['receipt.warehouse', 'cnPackage.order.customer', 'cnPackage.orderTracking'])
            ->whereNotNull('received_at')
            ->where('inspection_status', VnPackage::STATUS_INSPECTED)
            ->where(function ($query) {
                $query->whereNull('payment_status')
                    ->orWhere('payment_status', 'unpaid');
            })
            ->whereNull('payment_voucher_id')
            ->whereNotIn('id', PaymentVoucherPackage::query()
                ->select('vn_package_id')
                ->whereHas('voucher', fn ($voucherQuery) => $voucherQuery->whereIn('status', PaymentVoucher::ACTIVE_STATUSES)))
            ->when($filter['customer_id'] ?? null, fn ($query, $customerId) => $query->whereHas('cnPackage.order', fn ($orderQuery) => $orderQuery->where('customer_id', $customerId)))
            ->when($filter['search'] ?? null, function ($query, $search) {
                $term = '%'.trim((string) $search).'%';
                $query->where(function ($inner) use ($term) {
                    $inner->where('tracking_number_snapshot', 'like', $term)
                        ->orWhere('order_code_snapshot', 'like', $term)
                        ->orWhere('customer_name_snapshot', 'like', $term);
                });
            })
            ->orderByDesc('received_at');
    }

    public function preview(array $input): array
    {
        $packageIds = $this->normalizeIds($input['package_ids'] ?? []);
        if ($packageIds === []) {
            throw new HttpException(422, 'Vui lòng chọn ít nhất một vận đơn.');
        }

        $packages = VnPackage::query()
            ->with(['receipt.warehouse', 'cnPackage.order.customer'])
            ->whereIn('id', $packageIds)
            ->get();

        if ($packages->count() !== count($packageIds)) {
            throw new HttpException(422, 'Có vận đơn không tồn tại.');
        }

        $this->assertPackagesEligible($packages);
        $surcharges = $this->normalizeSurcharges($input['surcharges'] ?? []);

        return $this->buildVoucherPreview($packages, $surcharges, $this->normalizeDeliveryFee($input));
    }

    public function createDepositVoucher(
        int|string $orderId,
        mixed $depositPercent = null,
        bool $enforcePermission = true,
    ): PaymentVoucher {
        if ($enforcePermission) {
            $this->ensurePermission('payment_vouchers.create');
        }

        return DB::transaction(function () use ($orderId, $depositPercent) {
            $order = Order::query()->with(['items', 'customer'])->lockForUpdate()->findOrFail($orderId);
            if (! in_array((string) $order->status, ['pending', 'awaiting_deposit'], true)) {
                throw new HttpException(422, 'Đơn hàng chưa ở trạng thái có thể tạo yêu cầu đặt cọc.');
            }

            $existing = PaymentVoucher::query()
                ->where('voucher_type', 'deposit')
                ->where('order_id', $order->id)
                ->whereIn('status', [
                    PaymentVoucher::STATUS_WAITING_PAYMENT,
                    PaymentVoucher::STATUS_PARTIAL_PAID,
                    PaymentVoucher::STATUS_PAID,
                ])
                ->whereNull('cancelled_at')
                ->lockForUpdate()
                ->latest('id')
                ->first();
            if ($existing) {
                $this->syncOrderDepositSnapshot($order, $existing);

                return $existing->fresh($this->voucherRelations());
            }

            $percent = round((float) ($depositPercent ?? 70), 2);
            if ($percent <= 0 || $percent > 100) {
                throw new HttpException(422, 'Tỷ lệ đặt cọc phải lớn hơn 0 và không vượt quá 100%.');
            }

            /** @var OrderPricingService $pricing */
            $pricing = app(OrderPricingService::class);
            $lockedOrder = $order->exchange_rate_locked_at ? $order->fresh('items') : $pricing->lockExchangeRateForOrder($order);
            $baseAmountCny = (string) $lockedOrder->product_total_cny;
            $baseAmountVnd = (int) $lockedOrder->product_total_vnd;
            if ($baseAmountVnd <= 0 || ! $lockedOrder->exchange_rate_locked_at) {
                throw new HttpException(422, 'Chưa thể tạo yêu cầu đặt cọc vì chưa xác định được số tiền VND.');
            }

            $depositAmount = (int) round($baseAmountVnd * $percent / 100);
            if ($depositAmount <= 0) {
                throw new HttpException(422, 'Số tiền đặt cọc phải lớn hơn 0.');
            }

            $paymentAccount = $this->defaultPaymentAccount();
            if (! $paymentAccount) {
                throw new HttpException(422, 'Chưa cấu hình tài khoản nhận tiền mặc định.');
            }

            $voucherCode = $this->nextCode('DC', 'payment_vouchers', 'voucher_code');
            $voucher = PaymentVoucher::query()->create([
                'voucher_code' => $voucherCode,
                'voucher_type' => 'deposit',
                'order_id' => $lockedOrder->id,
                'customer_id' => $lockedOrder->customer_id,
                'created_by' => Auth::id(),
                'payment_method_expected' => 'bank_transfer',
                'payment_account_id' => $paymentAccount->id,
                'bank_name_snapshot' => $paymentAccount->bank_name,
                'bank_code_snapshot' => $paymentAccount->bank_code,
                'bank_account_number_snapshot' => $paymentAccount->account_number,
                'bank_account_holder_snapshot' => $paymentAccount->account_holder,
                'bank_branch_name_snapshot' => $paymentAccount->branch_name,
                'base_amount_cny' => $baseAmountCny,
                'exchange_rate' => $lockedOrder->exchange_rate,
                'base_amount_vnd' => $baseAmountVnd,
                'deposit_percent' => $percent,
                'currency' => 'VND',
                'transfer_content' => 'COC '.$lockedOrder->order_code,
                'status' => PaymentVoucher::STATUS_WAITING_PAYMENT,
                'subtotal' => $depositAmount,
                'discount_amount' => 0,
                'payment_method' => 'bank_transfer',
                'total_amount' => $depositAmount,
                'deposit_applied' => 0,
                'customer_credit_applied' => 0,
                'paid_amount' => 0,
                'remaining_amount' => $depositAmount,
                'note' => 'Deposit for order '.$lockedOrder->order_code,
            ]);

            PaymentVoucherItem::query()->create([
                'payment_voucher_id' => $voucher->id,
                'item_type' => 'deposit',
                'description' => 'Tiền đặt cọc đơn hàng '.$lockedOrder->order_code,
                'quantity' => 1,
                'unit_price' => $depositAmount,
                'amount' => $depositAmount,
                'reference_type' => 'Order',
                'reference_id' => $lockedOrder->id,
                'metadata' => ['deposit_percent' => $percent],
            ]);

            $this->syncOrderDepositSnapshot($lockedOrder, $voucher);

            $this->audit('create_deposit_payment_voucher', $voucher, null, $voucher->toArray());

            return $voucher->fresh($this->voucherRelations());
        });
    }

    public function confirmDepositPayment(int|string $orderId, array $input): Order
    {
        $this->ensurePermission('payments.confirm');

        return DB::transaction(function () use ($orderId, $input) {
            $order = Order::query()->with(['depositVoucher'])->lockForUpdate()->findOrFail($orderId);
            $voucher = PaymentVoucher::query()
                ->where('voucher_type', 'deposit')
                ->where('order_id', $order->id)
                ->whereNull('cancelled_at')
                ->lockForUpdate()
                ->latest('id')
                ->first();

            // Retried/double-clicked confirmations are idempotent. The row lock makes a
            // concurrent request wait until the first confirmation commits.
            if ((string) $order->status === 'deposited' && $voucher?->status === PaymentVoucher::STATUS_PAID) {
                $confirmedTransaction = $voucher->transactions()
                    ->where('status', PaymentTransaction::STATUS_CONFIRMED)
                    ->lockForUpdate()
                    ->latest('id')
                    ->first();
                if ($confirmedTransaction) {
                    $this->issueInvoice($voucher->id, $confirmedTransaction, false);
                }

                return $order->fresh();
            }
            if ((string) $order->status !== 'awaiting_deposit') {
                throw new HttpException(422, 'Đơn hàng không ở trạng thái chờ đặt cọc.');
            }

            if (! $voucher) {
                // Repair legacy/interrupted two-step flows where the order snapshot was
                // committed but the deposit voucher was never created.
                $voucher = $this->createDepositVoucher($order->id, $order->deposit_percent, false);
            }
            if ($voucher->expires_at && $voucher->expires_at->isPast()) {
                throw new HttpException(422, 'Phiếu đặt cọc đã hết hạn.');
            }
            if ($voucher->status === PaymentVoucher::STATUS_PAID) {
                throw new HttpException(422, 'Phiếu đặt cọc đã được thanh toán.');
            }
            if ($voucher->status !== PaymentVoucher::STATUS_WAITING_PAYMENT) {
                throw new HttpException(422, 'Phiếu đặt cọc không ở trạng thái chờ thanh toán.');
            }
            if ($voucher->transactions()->where('status', PaymentTransaction::STATUS_CONFIRMED)->lockForUpdate()->exists()) {
                throw new HttpException(422, 'Phiếu đặt cọc đã có giao dịch thanh toán thành công.');
            }

            $amount = (int) round((float) ($input['amount_vnd'] ?? $input['amount'] ?? 0));
            $remaining = (int) round((float) $voucher->remaining_amount);
            if ($amount <= 0) {
                throw new HttpException(422, 'Số tiền thực nhận phải lớn hơn 0.');
            }
            if ($remaining <= 0) {
                throw new HttpException(422, 'Phiếu đặt cọc không còn số tiền cần thanh toán.');
            }
            if ($amount !== $remaining) {
                throw new HttpException(422, 'Số tiền thực nhận phải bằng toàn bộ số tiền đặt cọc còn phải thanh toán.');
            }

            $bankTransactionCode = trim((string) ($input['transaction_code'] ?? $input['bank_transaction_code'] ?? ''));
            if ($bankTransactionCode === '') {
                throw new HttpException(422, 'Vui lòng nhập mã giao dịch ngân hàng.');
            }
            if (PaymentTransaction::query()
                ->where('bank_transaction_code', $bankTransactionCode)
                ->where('status', PaymentTransaction::STATUS_CONFIRMED)
                ->lockForUpdate()
                ->exists()) {
                throw new HttpException(422, 'Mã giao dịch ngân hàng đã tồn tại.');
            }

            $receivedAt = $this->parseReceivedAt($input['received_at'] ?? null);
            $transaction = PaymentTransaction::query()->create([
                'transaction_code' => $this->nextCode('GD', 'payment_transactions', 'transaction_code'),
                'payment_voucher_id' => $voucher->id,
                'amount' => $this->money($amount),
                'payment_method' => $voucher->payment_method_expected ?: 'bank_transfer',
                'bank_name' => $voucher->bank_name_snapshot,
                'bank_transaction_code' => $bankTransactionCode,
                'received_at' => $receivedAt,
                'confirmed_by' => Auth::id(),
                'status' => PaymentTransaction::STATUS_CONFIRMED,
                'note' => $input['note'] ?? null,
                'proof_image_path' => $input['proof_image_path'] ?? null,
            ]);

            $before = $voucher->toArray();
            $voucher->update([
                'paid_amount' => $this->money((float) $voucher->total_amount),
                'remaining_amount' => 0,
                'status' => PaymentVoucher::STATUS_PAID,
                'payment_method' => $voucher->payment_method_expected ?: 'bank_transfer',
                'paid_at' => $receivedAt,
            ]);

            $order->forceFill([
                'status' => 'deposited',
                'deposit_paid_amount_vnd' => (int) round((float) $voucher->total_amount),
                'deposit_remaining_amount_vnd' => 0,
                'deposit_status' => PaymentVoucher::STATUS_PAID,
                'deposit_paid_at' => $receivedAt,
                'deposit_confirmed_by' => Auth::id(),
                'deposit_manual_transaction_code' => $bankTransactionCode,
                'deposit_note' => $input['note'] ?? $order->deposit_note,
            ])->save();

            $this->audit('confirm_deposit_payment', $transaction, null, $transaction->toArray());
            $this->audit('update_deposit_payment_voucher', $voucher, $before, $voucher->fresh()->toArray());
            $this->issueInvoice($voucher->id, $transaction, false);

            return $order->fresh();
        });
    }

    public function create(array $input): PaymentVoucher
    {
        $this->ensurePermission('payment_vouchers.create');

        return DB::transaction(function () use ($input) {
            $packageIds = $this->normalizeIds($input['package_ids'] ?? []);
            if ($packageIds === []) {
                throw new HttpException(422, 'Vui lòng chọn ít nhất một vận đơn.');
            }

            $existing = ! empty($input['request_uuid'])
                ? PaymentVoucher::query()->where('request_uuid', $input['request_uuid'])->first()
                : null;
            if ($existing) {
                return $existing->fresh($this->voucherRelations());
            }

            $packages = VnPackage::query()
                ->with(['receipt.warehouse', 'cnPackage.order.customer'])
                ->whereIn('id', $packageIds)
                ->lockForUpdate()
                ->get();

            if ($packages->count() !== count($packageIds)) {
                throw new HttpException(422, 'Có vận đơn không tồn tại.');
            }

            $this->assertPackagesEligible($packages, true);
            $surcharges = $this->normalizeSurcharges($input['surcharges'] ?? []);
            $deliveryMethod = $input['delivery_method'] ?? 'pickup_at_warehouse';
            if (! in_array($deliveryMethod, ['pickup_at_warehouse', 'delivery'], true)) {
                throw new HttpException(422, 'Hình thức nhận hàng không hợp lệ.');
            }
            $deliveryFee = 0.0;
            if ($deliveryMethod === 'delivery') {
                if (strtolower(trim((string) ($input['preferred_carrier'] ?? ''))) !== 'ghn') {
                    throw new HttpException(422, 'Đơn vị vận chuyển giao tận nơi phải là GHN.');
                }

                $customerId = (int) $packages->first()->cnPackage?->order?->customer_id;
                $sourceAddress = null;
                $addressWasValidated = false;
                if (! empty($input['customer_address_id'])) {
                    $sourceAddress = $this->customerAddressService->findOwned($customerId, (int) $input['customer_address_id']);
                } elseif ((bool) ($input['save_address'] ?? false)) {
                    $sourceAddress = $this->customerAddressService->create($customerId, [
                        ...$input,
                        'label' => $input['address_label'] ?? null,
                        'is_default' => (bool) ($input['set_address_default'] ?? false),
                    ]);
                    $input['customer_address_id'] = $sourceAddress->id;
                    $addressWasValidated = true;
                } elseif ((bool) ($input['set_address_default'] ?? false)) {
                    throw new HttpException(422, 'Muốn đặt làm mặc định, bạn phải lưu địa chỉ cho lần sau.');
                }

                if ($sourceAddress) {
                    foreach (['receiver_name', 'receiver_phone', 'province_code', 'province_name', 'district_code', 'district_name', 'ward_code', 'ward_name', 'address_line', 'full_address'] as $field) {
                        $input[$field] = $sourceAddress->{$field};
                    }
                } else {
                    $validatedAddress = $this->customerAddressService->validatedValues($input);
                    $addressWasValidated = true;
                    foreach (['receiver_name', 'receiver_phone', 'province_code', 'province_name', 'district_code', 'district_name', 'ward_code', 'ward_name', 'address_line', 'full_address'] as $field) {
                        $input[$field] = $validatedAddress[$field];
                    }
                }

                $provinceId = (int) ($input['province_code'] ?? 0);
                $districtId = (int) ($input['district_code'] ?? 0);
                $wardCode = trim((string) ($input['ward_code'] ?? ''));
                $destination = $addressWasValidated ? [
                    'province' => ['province_id' => $provinceId, 'name' => $input['province_name']],
                    'district' => ['district_id' => $districtId, 'province_id' => $provinceId, 'name' => $input['district_name']],
                    'ward' => ['ward_code' => $wardCode, 'district_id' => $districtId, 'name' => $input['ward_name']],
                ] : $this->ghnService->validateDestination($provinceId, $districtId, $wardCode);
                $insuranceValue = $this->ghnInsuranceValueService->forPackages($packages);
                $quote = $this->ghnService->quote([
                    'package_ids' => $packageIds,
                    'to_district_id' => $districtId,
                    'to_ward_code' => $wardCode,
                    'insurance_value' => $insuranceValue,
                    'cod_amount' => 0,
                ], $packages);
                $deliveryFee = (float) $quote['total'];

                // Persist names resolved from GHN instead of trusting client-provided snapshots.
                $input['province_name'] = $destination['province']['name'];
                $input['district_name'] = $destination['district']['name'];
                $input['ward_name'] = $destination['ward']['name'];
                $input['province_code'] = (string) $destination['province']['province_id'];
                $input['district_code'] = (string) $destination['district']['district_id'];
                $input['ward_code'] = $destination['ward']['ward_code'];
                $input['preferred_carrier'] = 'ghn';
                $input['full_address'] = implode(', ', array_filter([
                    trim((string) ($input['address_line'] ?? '')),
                    $input['ward_name'],
                    $input['district_name'],
                    $input['province_name'],
                ]));
            }
            $preview = $this->buildVoucherPreview($packages, $surcharges, $deliveryFee);
            $customer = $preview['customer'];
            $paymentMethodExpected = $input['payment_method_expected'] ?? 'bank_transfer';
            $paymentAccount = in_array($paymentMethodExpected, ['bank_transfer', 'mixed'], true) ? $this->defaultPaymentAccount() : null;
            if (in_array($paymentMethodExpected, ['bank_transfer', 'mixed'], true) && ! $paymentAccount) {
                throw new HttpException(422, 'Chưa cấu hình tài khoản nhận tiền mặc định.');
            }
            $voucherCode = $this->nextCode('PT', 'payment_vouchers', 'voucher_code');
            $deliveryAddress = trim((string) ($input['full_address'] ?? ''));

            if ($deliveryMethod === 'delivery' && $deliveryAddress === '') {
                throw new HttpException(422, 'Vui lòng nhập địa chỉ giao hàng.');
            }
            $voucher = PaymentVoucher::query()->create([
                'voucher_code' => $voucherCode,
                'request_uuid' => $input['request_uuid'] ?? null,
                'customer_id' => $customer->id,
                'vn_warehouse_id' => $input['vn_warehouse_id'] ?? $packages->first()->receipt?->vn_warehouse_id,
                'created_by' => Auth::id(),
                'payment_method_expected' => $paymentMethodExpected,
                'payment_method' => $paymentMethodExpected,
                'payment_account_id' => $paymentAccount?->id,
                'bank_name_snapshot' => $paymentAccount?->bank_name,
                'bank_code_snapshot' => $paymentAccount?->bank_code,
                'bank_account_number_snapshot' => $paymentAccount?->account_number,
                'bank_account_holder_snapshot' => $paymentAccount?->account_holder,
                'bank_branch_name_snapshot' => $paymentAccount?->branch_name,
                'transfer_content' => $paymentAccount ? 'TT '.$voucherCode : null,
                'voucher_type' => 'shipping',
                'status' => PaymentVoucher::STATUS_WAITING_PAYMENT,
                'subtotal' => $preview['gross_total'],
                'discount_amount' => $preview['deposit_applied'] + $preview['customer_credit_applied'],
                'base_amount_cny' => $preview['product_total_cny'],
                'base_amount_vnd' => $preview['product_total'],
                'currency' => 'VND',
                'total_amount' => $preview['total_amount'],
                'deposit_applied' => $preview['deposit_applied'],
                'customer_credit_applied' => $preview['customer_credit_applied'],
                'paid_amount' => 0,
                'remaining_amount' => $preview['remaining_amount'],
                'note' => $input['note'] ?? null,
            ]);

            foreach ($preview['packages'] as $row) {
                PaymentVoucherPackage::query()->create([
                    'payment_voucher_id' => $voucher->id,
                    'vn_package_id' => $row['id'],
                    'order_id' => $row['order_id'],
                    'actual_weight' => $row['actual_weight'],
                    'volumetric_weight' => $row['volumetric_weight'],
                    'chargeable_weight' => $row['chargeable_weight'],
                    'price_per_kg' => $row['price_per_kg'],
                    'shipping_rate_id' => $row['shipping_rate_id'],
                    'shipping_rate_detail_id' => $row['shipping_rate_detail_id'],
                    'unit_price' => $row['unit_price'],
                    'price_type' => $row['price_type'],
                    'rate_description' => $row['rate_description'],
                    'shipping_fee' => $row['shipping_fee'],
                    'total_amount' => $row['total_amount'],
                ]);
            }

            $this->persistVoucherItems($voucher, $preview);
            $calculatedTotal = $this->calculateVoucherTotal($voucher);
            if ($calculatedTotal !== $this->money((float) $preview['total_amount'])) {
                throw new HttpException(422, 'Chi tiết phiếu không khớp với tổng thanh toán.');
            }
            $this->deliveryRequestService->createForVoucher($voucher, $input);

            VnPackage::query()->whereIn('id', $packageIds)->update([
                'payment_status' => 'unpaid',
                'payment_voucher_id' => $voucher->id,
                'payment_locked_at' => now(),
                'delivery_status' => 'waiting_payment',
            ]);

            if ($voucher->customer_credit_applied > 0) {
                $this->appendLedger($voucher->customer_id, $voucher->id, null, 'debit', $voucher->customer_credit_applied, 'Áp dụng tiền dư cho phiếu '.$voucher->voucher_code);
                $this->audit('apply_customer_credit', $voucher, null, ['amount' => $voucher->customer_credit_applied]);
            }

            $this->audit('create_payment_voucher', $voucher, null, $voucher->toArray());
            $this->audit('package_status_changed', $voucher, null, ['package_ids' => $packageIds, 'delivery_status' => 'waiting_payment']);

            return $voucher->fresh($this->voucherRelations());
        });
    }

    public function confirmTransaction(int|string $voucherId, array $input): PaymentVoucher
    {
        $this->ensurePermission('payments.confirm');

        $depositVoucher = PaymentVoucher::query()->find($voucherId);
        if ($depositVoucher?->voucher_type === 'deposit' && $depositVoucher->order_id) {
            $order = $this->confirmDepositPayment($depositVoucher->order_id, [
                'amount_vnd' => $input['amount'] ?? 0,
                'transaction_code' => $input['bank_transaction_code'] ?? null,
                'received_at' => $input['received_at'] ?? null,
                'note' => $input['note'] ?? null,
                'proof_image_path' => $input['proof_image_path'] ?? null,
            ]);

            return $order->depositVoucher?->fresh($this->voucherRelations())
                ?? PaymentVoucher::query()->with($this->voucherRelations())->findOrFail($voucherId);
        }

        return DB::transaction(function () use ($voucherId, $input) {
            $voucher = PaymentVoucher::query()->with($this->voucherRelations())->lockForUpdate()->find($voucherId);
            if (! $voucher) {
                throw new HttpException(404, 'Không tìm thấy phiếu thanh toán.');
            }
            if (! in_array($voucher->status, [PaymentVoucher::STATUS_WAITING_PAYMENT, PaymentVoucher::STATUS_PARTIAL_PAID], true)) {
                throw new HttpException(422, 'Phiếu không ở trạng thái có thể xác nhận thanh toán.');
            }

            $amount = (float) ($input['amount'] ?? 0);
            if ($amount <= 0) {
                throw new HttpException(422, 'Số tiền nhận phải lớn hơn 0.');
            }

            $method = $input['payment_method'] ?? null;
            if (! in_array($method, ['bank_transfer', 'cash'], true)) {
                throw new HttpException(422, 'Phương thức thanh toán không hợp lệ.');
            }
            if ($method === 'bank_transfer' && trim((string) ($input['bank_name'] ?? '')) === '') {
                throw new HttpException(422, 'Vui lòng nhập ngân hàng nhận tiền.');
            }

            $transaction = PaymentTransaction::query()->create([
                'transaction_code' => $this->nextCode('GD', 'payment_transactions', 'transaction_code'),
                'payment_voucher_id' => $voucher->id,
                'amount' => $this->money($amount),
                'payment_method' => $method,
                'bank_name' => $input['bank_name'] ?? null,
                'bank_transaction_code' => $input['bank_transaction_code'] ?? null,
                'received_at' => $this->parseReceivedAt($input['received_at'] ?? null),
                'confirmed_by' => Auth::id(),
                'status' => PaymentTransaction::STATUS_CONFIRMED,
                'note' => $input['note'] ?? null,
                'proof_image_path' => $input['proof_image_path'] ?? null,
            ]);

            $paid = (float) $voucher->transactions()->where('status', PaymentTransaction::STATUS_CONFIRMED)->sum('amount');
            $overpaid = max(0, $paid - (float) $voucher->total_amount);
            $remaining = max(0, (float) $voucher->total_amount - $paid);
            $status = $remaining <= 0 ? PaymentVoucher::STATUS_PAID : PaymentVoucher::STATUS_PARTIAL_PAID;
            $before = $voucher->toArray();

            $voucher->update([
                'paid_amount' => $this->money(min($paid, (float) $voucher->total_amount)),
                'remaining_amount' => $this->money($remaining),
                'status' => $status,
                'payment_method' => $method,
                'paid_at' => $status === PaymentVoucher::STATUS_PAID ? $transaction->received_at : null,
            ]);

            if ($overpaid > 0) {
                $this->appendLedger($voucher->customer_id, $voucher->id, $transaction->id, 'credit', $overpaid, 'Khách trả dư phiếu '.$voucher->voucher_code);
                $this->audit('create_customer_credit', $voucher, null, ['amount' => $overpaid]);
            }

            $this->audit('confirm_payment_transaction', $transaction, null, $transaction->toArray());
            $this->audit('update_payment_voucher', $voucher, $before, $voucher->fresh()->toArray());

            $freshVoucher = $voucher->fresh();
            if ($freshVoucher?->voucher_type === 'deposit' && $freshVoucher->order_id) {
                $this->syncOrderDepositSnapshot($freshVoucher->order()->lockForUpdate()->first(), $freshVoucher);
            }

            if ($status === PaymentVoucher::STATUS_PAID && $freshVoucher?->voucher_type !== 'deposit') {
                $this->deliveryRequestService->markVoucherPaid($freshVoucher);
                $this->issueInvoice($voucher->id);
            }

            return $voucher->fresh($this->voucherRelations());
        });
    }

    public function cancel(int|string $voucherId, string $reason): PaymentVoucher
    {
        $this->ensurePermission('payment_vouchers.update');

        return DB::transaction(function () use ($voucherId, $reason) {
            $voucher = PaymentVoucher::query()->with($this->voucherRelations())->lockForUpdate()->find($voucherId);
            if (! $voucher) {
                throw new HttpException(404, 'Không tìm thấy phiếu thanh toán.');
            }
            if (! in_array($voucher->status, [PaymentVoucher::STATUS_WAITING_PAYMENT, PaymentVoucher::STATUS_PARTIAL_PAID], true)) {
                throw new HttpException(422, 'Phiếu không ở trạng thái có thể xác nhận thanh toán.');
            }
            if ($voucher->transactions()->where('status', PaymentTransaction::STATUS_CONFIRMED)->exists()) {
                throw new HttpException(422, 'Phiếu đã có tiền xác nhận. Vui lòng xử lý hoàn tiền hoặc chuyển credit trước khi hủy.');
            }
            if (trim($reason) === '') {
                throw new HttpException(422, 'Vui lòng nhập lý do hủy.');
            }

            $before = $voucher->toArray();
            $voucher->update([
                'status' => PaymentVoucher::STATUS_CANCELLED,
                'cancelled_reason' => $reason,
                'cancelled_by' => Auth::id(),
                'cancelled_at' => now(),
            ]);
            $this->deliveryRequestService->cancelForVoucher($voucher);

            VnPackage::query()->where('payment_voucher_id', $voucher->id)->update([
                'payment_status' => 'unpaid',
                'payment_voucher_id' => null,
                'payment_locked_at' => null,
                'delivery_status' => 'inspected',
            ]);

            $this->audit('cancel_payment_voucher', $voucher, $before, $voucher->fresh()->toArray());

            return $voucher->fresh($this->voucherRelations());
        });
    }

    public function issueInvoice(
        int|string $voucherId,
        ?PaymentTransaction $paymentTransaction = null,
        bool $enforcePermission = true,
    ): Invoice {
        if ($enforcePermission) {
            $this->ensurePermission('invoices.create');
        }

        $voucher = PaymentVoucher::query()->with($this->voucherRelations())->lockForUpdate()->find($voucherId);
        if (! $voucher) {
            throw new HttpException(404, 'Không tìm thấy phiếu thanh toán.');
        }
        if ($voucher->status !== PaymentVoucher::STATUS_PAID) {
            throw new HttpException(422, 'Chỉ tạo hóa đơn khi phiếu đã thanh toán đủ.');
        }
        if ($voucher->invoice) {
            return $voucher->invoice->load('items');
        }

        $isDeposit = $voucher->voucher_type === 'deposit';
        if ($isDeposit && ! $paymentTransaction) {
            $paymentTransaction = $voucher->transactions
                ->where('status', PaymentTransaction::STATUS_CONFIRMED)
                ->sortByDesc('id')
                ->first();
        }

        $invoice = Invoice::query()->create([
            'payment_voucher_id' => $voucher->id,
            'invoice_type' => $isDeposit ? 'deposit' : 'shipping',
            'order_id' => $voucher->order_id,
            'payment_transaction_id' => $paymentTransaction?->id,
            'invoice_code' => $this->nextCode('HD', 'invoices', 'invoice_code'),
            'customer_id' => $voucher->customer_id,
            'created_by' => Auth::id() ?? $voucher->created_by,
            'confirmed_by' => Auth::id() ?? $voucher->created_by,
            'confirmed_at' => now(),
            'issued_by' => Auth::id(),
            'issued_at' => now(),
            'total_amount' => $voucher->total_amount,
            'paid_amount' => $voucher->paid_amount,
            'status' => 'issued',
            'note' => $isDeposit
                ? 'Hóa đơn đặt cọc cho đơn hàng '.($voucher->order?->order_code ?? $voucher->order_id)
                : 'Hóa đơn từ phiếu thanh toán '.$voucher->voucher_code,
        ]);

        if ($isDeposit) {
            InvoiceItem::query()->create([
                'invoice_id' => $invoice->id,
                'item_type' => 'deposit',
                'description' => 'Tiền đặt cọc đơn hàng '.($voucher->order?->order_code ?? $voucher->order_id),
                'quantity' => 1,
                'unit_price' => $voucher->total_amount,
                'amount' => $voucher->total_amount,
                'metadata' => [
                    'order_id' => $voucher->order_id,
                    'order_code' => $voucher->order?->order_code,
                    'order_value_vnd' => $voucher->base_amount_vnd,
                    'deposit_percent' => $voucher->deposit_percent,
                    'deposit_amount_vnd' => $voucher->total_amount,
                    'received_amount_vnd' => $paymentTransaction?->amount ?? $voucher->paid_amount,
                    'bank_transaction_code' => $paymentTransaction?->bank_transaction_code,
                    'received_at' => $paymentTransaction?->received_at?->toISOString(),
                ],
            ]);
        }

        foreach ($isDeposit ? [] : $voucher->items as $item) {
            $package = $item->reference_type === 'PaymentVoucherPackage'
                ? $voucher->packages->firstWhere('id', $item->reference_id)
                : null;
            InvoiceItem::query()->create([
                'invoice_id' => $invoice->id,
                'vn_package_id' => $package?->vn_package_id,
                'weight' => $item->item_type === 'weight_fee' ? $item->quantity : 0,
                'volume' => $package?->vnPackage?->actual_volume ?? 0,
                'shipping_fee' => $item->amount,
                'payment_voucher_package_id' => $package?->id,
                'item_type' => $item->item_type,
                'description' => $item->description,
                'quantity' => $item->quantity,
                'unit_price' => $item->unit_price,
                'amount' => $item->amount,
                'metadata' => $item->metadata,
            ]);
        }

        if (! $isDeposit) {
            VnPackage::query()->where('payment_voucher_id', $voucher->id)->update([
                'payment_status' => 'paid',
                'delivery_status' => 'ready_for_delivery',
            ]);
            $this->deliveryRequestService->markVoucherPaid($voucher);
        }

        $this->audit('issue_invoice', $invoice, null, $invoice->toArray());
        if (! $isDeposit) {
            $this->audit('package_status_changed', $voucher, null, ['delivery_status' => 'ready_for_delivery']);
        }

        return $invoice->load('items');
    }

    public function recalculateVoucherStatus(PaymentVoucher $voucher): void
    {
        $paid = (float) $voucher->transactions()->where('status', PaymentTransaction::STATUS_CONFIRMED)->sum('amount');
        $remaining = max(0, (float) $voucher->total_amount - $paid);
        $voucher->update([
            'paid_amount' => $this->money(min($paid, (float) $voucher->total_amount)),
            'remaining_amount' => $this->money($remaining),
            'status' => $remaining <= 0 ? PaymentVoucher::STATUS_PAID : ($paid > 0 ? PaymentVoucher::STATUS_PARTIAL_PAID : PaymentVoucher::STATUS_WAITING_PAYMENT),
        ]);
    }

    private function syncOrderDepositSnapshot(?Order $order, PaymentVoucher $voucher): void
    {
        if (! $order) {
            return;
        }

        $isPaid = $voucher->status === PaymentVoucher::STATUS_PAID;
        $paidAmount = (int) round((float) $voucher->paid_amount);
        $remainingAmount = (int) round((float) $voucher->remaining_amount);

        $order->forceFill([
            'status' => $isPaid ? 'deposited' : 'awaiting_deposit',
            'deposit_percent' => $voucher->deposit_percent,
            'deposit_amount_vnd' => (int) round((float) $voucher->total_amount),
            'deposit_paid_amount_vnd' => $paidAmount,
            'deposit_remaining_amount_vnd' => $remainingAmount,
            'deposit_status' => $voucher->status,
            'deposit_transfer_content' => $voucher->transfer_content,
            'deposit_requested_at' => $order->deposit_requested_at ?? $voucher->created_at ?? now(),
            'deposit_paid_at' => $isPaid ? ($order->deposit_paid_at ?? $voucher->updated_at ?? now()) : $order->deposit_paid_at,
        ])->save();
    }

    public function voucherRelations(): array
    {
        return [
            'customer',
            'paymentAccount',
            'warehouse',
            'creator',
            'packages.vnPackage.cnPackage.order.customer',
            'items',
            'deliveryRequest.address',
            'deliveryRequest.shipments.trackingEvents',
            'transactions',
            'invoice.items',
        ];
    }

    public function defaultPaymentAccount(): ?PaymentAccount
    {
        return PaymentAccount::query()
            ->where('is_active', true)
            ->orderByDesc('is_default')
            ->orderByDesc('id')
            ->first();
    }

    private function ensurePermission(string $permission): void
    {
        app(PermissionService::class)->authorize(Auth::user(), $permission);
    }

    private function assertPackagesEligible($packages, bool $checkActiveVoucher = false): void
    {
        $customerIds = [];
        foreach ($packages as $package) {
            $customer = $package->cnPackage?->order?->customer;
            if (! $customer) {
                throw new HttpException(422, 'Vận đơn '.$package->id.' chưa liên kết khách hàng.');
            }
            $customerIds[] = (int) $customer->id;
            if (! $package->received_at || ! $package->vn_batch_receipt_id) {
                throw new HttpException(422, 'Vận đơn '.$package->tracking_number_snapshot.' chưa nhập kho Việt Nam.');
            }
            if ($package->inspection_status !== VnPackage::STATUS_INSPECTED) {
                throw new HttpException(422, 'Vận đơn '.$package->tracking_number_snapshot.' chưa được kiểm.');
            }
            if (in_array($package->delivery_status, ['delivered', 'cancelled'], true)) {
                throw new HttpException(422, 'Vận đơn '.$package->tracking_number_snapshot.' đã giao hoặc đã hủy.');
            }
            if ($checkActiveVoucher && $this->isPackageInActiveVoucher($package)) {
                throw new HttpException(422, 'Vận đơn '.$package->tracking_number_snapshot.' đang nằm trong phiếu thanh toán active.');
            }
        }
        if (count(array_unique($customerIds)) !== 1) {
            throw new HttpException(422, 'Chỉ được tạo phiếu cho các vận đơn cùng một khách hàng.');
        }
    }

    private function isPackageInActiveVoucher(VnPackage $package): bool
    {
        if ($package->payment_voucher_id && in_array($package->delivery_status, ['waiting_payment'], true)) {
            return true;
        }

        return PaymentVoucherPackage::query()
            ->where('vn_package_id', $package->id)
            ->whereHas('voucher', fn ($query) => $query->whereIn('status', PaymentVoucher::ACTIVE_STATUSES))
            ->exists();
    }

    private function calculatePackageRows($packages, array $surcharges, float $domesticShippingFee = 0): array
    {
        $rows = [];
        foreach ($packages as $index => $package) {
            $actualWeight = (float) ($package->actual_weight ?? 0);
            $volumetricWeight = $this->volumetricWeight($package);
            $chargeableWeight = max($actualWeight, $volumetricWeight);
            if ($chargeableWeight <= 0) {
                throw new HttpException(422, 'Vận đơn '.$package->tracking_number_snapshot.' chưa có cân tính phí.');
            }
            $rateResult = $this->shippingRateService->calculateFee($chargeableWeight, [
                'date' => now()->toDateString(),
                'warehouse_id' => $package->receipt?->vn_warehouse_id,
                'customer_type' => $package->cnPackage?->order?->customer?->vip_group,
            ]);
            $shippingFee = $this->money($rateResult['shipping_fee']);
            $packageSurcharge = $this->packageSurchargeTotal((int) $package->id, $surcharges);
            $rows[] = [
                'id' => (string) $package->id,
                'tracking_number' => $package->tracking_number_snapshot,
                'order_id' => $package->cnPackage?->order_id,
                'order_code' => $package->cnPackage?->order?->order_code ?? $package->order_code_snapshot,
                'customer_name' => $package->cnPackage?->order?->customer?->name ?? $package->customer_name_snapshot,
                'actual_weight' => $this->weight($actualWeight),
                'volumetric_weight' => $this->weight($volumetricWeight),
                'chargeable_weight' => $this->weight($chargeableWeight),
                'shipping_rate_id' => $rateResult['rate']->id,
                'shipping_rate_detail_id' => $rateResult['detail']->id,
                'price_per_kg' => $this->money($rateResult['unit_price']),
                'unit_price' => $this->money($rateResult['unit_price']),
                'price_type' => $rateResult['price_type'],
                'rate_description' => $rateResult['rate_description'],
                'shipping_fee' => $shippingFee,
                'additional_charge_amount' => $this->money($packageSurcharge),
                'total_amount' => $shippingFee,
            ];
        }

        return $rows;
    }

    private function buildVoucherPreview($packages, array $surcharges, float $domesticShippingFee = 0): array
    {
        $packageRows = $this->calculatePackageRows($packages, $surcharges, $domesticShippingFee);
        $customer = $packages->first()->cnPackage?->order?->customer;

        if (! $customer) {
            throw new HttpException(422, 'Không xác định được khách hàng của phiếu thanh toán.');
        }

        $amounts = $this->calculateVoucherAmounts($packages, $packageRows, $surcharges, (int) $customer->id, $domesticShippingFee);

        return [
            'customer' => $customer,
            'packages' => array_values($packageRows),
            ...$amounts,
            'payment_account' => $this->defaultPaymentAccount(),
            'transfer_content' => 'TT <ma phieu thanh toan>',
        ];
    }

    private function calculateVoucherAmounts($packages, array $packageRows, array $surcharges, int $customerId, float $domesticShippingFee): array
    {
        $orders = $packages
            ->map(fn (VnPackage $package) => $package->cnPackage?->order)
            ->filter()
            ->unique(fn (Order $order) => (int) $order->id)
            ->values();

        $productTotal = (float) $orders->sum(fn (Order $order) => max(0, (float) $order->product_total_vnd));
        $productTotalCny = (float) $orders->sum(fn (Order $order) => max(0, (float) $order->product_total_cny));
        $shippingTotal = array_sum(array_column($packageRows, 'shipping_fee'));
        $deliveryFeeTotal = $domesticShippingFee;
        $additionalChargeTotal = array_sum(array_column($packageRows, 'additional_charge_amount'))
            + $this->voucherLevelSurchargeTotal($surcharges);
        $grossTotal = $productTotal + $shippingTotal + $deliveryFeeTotal + $additionalChargeTotal;
        $paidDeposits = (float) $orders->sum(fn (Order $order) => max(0, (float) $order->deposit_paid_amount_vnd));
        $depositApplied = min($paidDeposits, $grossTotal);
        $afterDeposit = max(0, $grossTotal - $depositApplied);
        $creditAvailable = $this->customerCreditBalance($customerId);
        $creditApplied = min($creditAvailable, $afterDeposit);
        $totalAmount = max(0, $afterDeposit - $creditApplied);

        return [
            'order_total' => $this->money($productTotal),
            'product_total' => $this->money($productTotal),
            'product_total_cny' => round($productTotalCny, 2),
            'weight_shipping_total' => $this->money($shippingTotal),
            'delivery_fee_total' => $this->money($deliveryFeeTotal),
            'additional_charge_total' => $this->money($additionalChargeTotal),
            'surcharges' => $surcharges,
            'gross_total' => $this->money($grossTotal),
            'deposit_applied' => $this->money($depositApplied),
            'customer_credit_available' => $this->money($creditAvailable),
            'customer_credit_applied' => $this->money($creditApplied),
            'total_amount' => $this->money($totalAmount),
            'remaining_amount' => $this->money($totalAmount),
        ];
    }

    private function volumetricWeight(VnPackage $package): float
    {
        if ($package->actual_length && $package->actual_width && $package->actual_height) {
            return ((float) $package->actual_length * (float) $package->actual_width * (float) $package->actual_height) / 6000;
        }

        return (float) ($package->actual_volume ?? 0);
    }

    private function parseReceivedAt(mixed $value): Carbon
    {
        if ($value instanceof Carbon) {
            return $value;
        }

        if ($value instanceof \DateTimeInterface) {
            return Carbon::instance($value);
        }

        if ($value === null || trim((string) $value) === '') {
            return now();
        }

        try {
            return Carbon::parse((string) $value);
        } catch (\Throwable) {
            throw new HttpException(422, 'Thời gian nhận tiền không hợp lệ.');
        }
    }

    private function persistVoucherItems(PaymentVoucher $voucher, array $preview): void
    {
        PaymentVoucherItem::query()->create([
            'payment_voucher_id' => $voucher->id,
            'item_type' => 'order_amount',
            'description' => 'Giá trị hàng hóa',
            'quantity' => 1,
            'unit_price' => $preview['product_total'],
            'amount' => $preview['product_total'],
            'reference_type' => 'PaymentVoucher',
            'reference_id' => $voucher->id,
        ]);

        $packageModels = $voucher->packages()->get()->keyBy(fn (PaymentVoucherPackage $package) => (string) $package->vn_package_id);
        foreach ($preview['packages'] as $row) {
            $packageModel = $packageModels->get((string) $row['id']);
            PaymentVoucherItem::query()->create([
                'payment_voucher_id' => $voucher->id,
                'item_type' => 'weight_fee',
                'description' => 'Cước Trung Quốc → Việt Nam - '.($row['tracking_number'] ?? $row['id']),
                'quantity' => $row['chargeable_weight'],
                'unit_price' => $row['price_per_kg'],
                'amount' => $row['shipping_fee'],
                'reference_type' => 'PaymentVoucherPackage',
                'reference_id' => $packageModel?->id,
                'metadata' => ['vn_package_id' => $row['id'], 'price_type' => $row['price_type']],
            ]);
        }

        if ((float) $preview['delivery_fee_total'] > 0) {
            PaymentVoucherItem::query()->create([
                'payment_voucher_id' => $voucher->id,
                'item_type' => 'domestic_shipping',
                'description' => 'Phí giao hàng nội địa Việt Nam',
                'quantity' => 1,
                'unit_price' => $preview['delivery_fee_total'],
                'amount' => $preview['delivery_fee_total'],
                'reference_type' => 'PaymentVoucher',
                'reference_id' => $voucher->id,
            ]);
        }

        foreach ($preview['surcharges'] as $surcharge) {
            PaymentVoucherItem::query()->create([
                'payment_voucher_id' => $voucher->id,
                'item_type' => 'surcharge',
                'description' => $surcharge['note'] ?: 'Phụ phí '.$surcharge['surcharge_type'],
                'quantity' => 1,
                'unit_price' => $surcharge['amount'],
                'amount' => $surcharge['amount'],
                'reference_type' => $surcharge['vn_package_id'] ? 'VnPackage' : null,
                'reference_id' => $surcharge['vn_package_id'],
                'metadata' => ['surcharge_type' => $surcharge['surcharge_type'], 'vn_package_id' => $surcharge['vn_package_id']],
            ]);
        }

        $voucher->update([
            'subtotal' => $this->money((float) $voucher->items()->sum('amount')),
            'discount_amount' => $this->money((float) $voucher->deposit_applied + (float) $voucher->customer_credit_applied),
        ]);
    }

    public function calculateVoucherTotal(PaymentVoucher $voucher): float
    {
        return $this->money(max(0, (float) $voucher->items()->sum('amount') - (float) $voucher->discount_amount));
    }

    private function normalizeSurcharges(array $surcharges): array
    {
        return array_values(array_filter(array_map(function ($item) {
            $amount = (float) ($item['amount'] ?? 0);
            if ($amount <= 0) {
                return null;
            }

            return [
                'vn_package_id' => $item['vn_package_id'] ?? null,
                'surcharge_type' => $item['surcharge_type'] ?? 'other',
                'amount' => $this->money($amount),
                'note' => $item['note'] ?? null,
            ];
        }, $surcharges)));
    }

    private function normalizeDeliveryFee(array $input): float
    {
        $fee = (float) ($input['delivery_fee'] ?? 0);

        if (! is_finite($fee) || $fee < 0) {
            throw new HttpException(422, 'Phí vận chuyển nội địa Việt Nam không hợp lệ.');
        }

        return $this->money($fee);
    }

    private function packageSurchargeTotal(int $packageId, array $surcharges): float
    {
        return array_sum(array_map(fn ($item) => (int) ($item['vn_package_id'] ?? 0) === $packageId ? (float) ($item['amount'] ?? 0) : 0, $surcharges));
    }

    private function voucherLevelSurchargeTotal(array $surcharges): float
    {
        return array_sum(array_map(fn ($item) => empty($item['vn_package_id']) ? (float) ($item['amount'] ?? 0) : 0, $surcharges));
    }

    private function customerCreditBalance(int $customerId): float
    {
        $last = CustomerBalanceLedger::query()->where('customer_id', $customerId)->latest('id')->first();

        return max(0, (float) ($last?->balance_after ?? 0));
    }

    private function appendLedger(int $customerId, int $voucherId, ?int $transactionId, string $type, float $amount, string $description): CustomerBalanceLedger
    {
        $current = $this->customerCreditBalance($customerId);
        $balance = in_array($type, ['credit', 'deposit', 'refund', 'adjustment'], true)
            ? $current + $amount
            : $current - $amount;

        return CustomerBalanceLedger::query()->create([
            'customer_id' => $customerId,
            'payment_voucher_id' => $voucherId,
            'transaction_id' => $transactionId,
            'type' => $type,
            'amount' => $this->money($amount),
            'balance_after' => $this->money($balance),
            'description' => $description,
            'created_by' => Auth::id(),
        ]);
    }

    private function normalizeIds(array $ids): array
    {
        return array_values(array_unique(array_filter(array_map(fn ($id) => (int) $id, $ids))));
    }

    private function nextCode(string $prefix, string $table, string $column): string
    {
        $next = ((int) DB::table($table)->lockForUpdate()->count()) + 1;
        do {
            $code = $prefix.str_pad((string) $next, 6, '0', STR_PAD_LEFT);
            $next++;
        } while (DB::table($table)->where($column, $code)->exists());

        return $code;
    }

    private function audit(string $action, object $entity, ?array $before, ?array $after): void
    {
        AuditLog::query()->create([
            'user_id' => Auth::id(),
            'action' => $action,
            'entity_type' => class_basename($entity),
            'entity_id' => $entity->id ?? null,
            'before_data' => $before,
            'after_data' => $after,
            'ip' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'created_at' => now(),
        ]);
    }

    private function money(float $value): float
    {
        return round($value, 0);
    }

    private function weight(float $value): float
    {
        return round($value, 3);
    }
}
