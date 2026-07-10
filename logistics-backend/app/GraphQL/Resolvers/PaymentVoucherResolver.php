<?php

namespace App\GraphQL\Resolvers;

use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\PaymentTransaction;
use App\Models\PaymentVoucher;
use App\Services\PaymentVoucherService;
use Illuminate\Support\Facades\DB;

class PaymentVoucherResolver
{
    public function __construct(
        private readonly PaymentVoucherService $service,
    ) {
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
            ->when($filter['voucher_code'] ?? null, fn ($query, $value) => $query->where('voucher_code', 'like', '%' . trim($value) . '%'))
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

    public function confirmTransaction($_, array $args)
    {
        return $this->service->confirmTransaction($args['payment_voucher_id'], $args['input'] ?? []);
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
