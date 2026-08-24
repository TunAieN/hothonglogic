<?php

namespace App\GraphQL\Resolvers;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Builder;

class InvoiceResolver
{
    public function list($root, array $args) : Builder
    {
        $filter = $args['filter'] ?? [];

       return Invoice::query()
            ->with(['customer', 'issuer', 'creator', 'confirmer', 'order', 'paymentTransaction', 'voucher.transactions', 'voucher.packages.order', 'items'])
            ->when(isset($filter['invoice_code']), function ($query) use ($filter) {
                $query->where('invoice_code', 'like', '%' . $filter['invoice_code'] . '%');
            })
            ->when(isset($filter['customer_id']), function ($query) use ($filter) {
                $query->where('customer_id', $filter['customer_id']);
            })
            ->when(isset($filter['invoice_type']), function ($query) use ($filter) {
                $query->where('invoice_type', $filter['invoice_type']);
            })
            ->when(isset($filter['order_id']), function ($query) use ($filter) {
                $query->where('order_id', $filter['order_id']);
            })
            ->when(isset($filter['status']), function ($query) use ($filter) {
                $query->where('status', $filter['status']);
            })
            ->when(isset($filter['issued_from']), function ($query) use ($filter) {
                $query->whereDate('issued_at', '>=', $filter['issued_from']);
            })
            ->when(isset($filter['issued_to']), function ($query) use ($filter) {
                $query->whereDate('issued_at', '<=', $filter['issued_to']);
            });

    }
    public function show($root, array $args) : ?Invoice
    {
        return Invoice::query()
            ->with(['customer', 'issuer', 'creator', 'confirmer', 'order', 'paymentTransaction', 'voucher.transactions', 'voucher.packages.order', 'items'])
            ->find($args['id']);
    }

    public function statistics($root, array $args) : array
    {
        $baseQuery = Invoice::query();

        return [
            'totalInvoices' => (clone $baseQuery)->count(),
            'paidInvoices' => (clone $baseQuery)
                ->whereRaw('COALESCE(paid_amount, 0) >= COALESCE(total_amount, 0)')
                ->count(),
            'unpaidInvoices' => (clone $baseQuery)
                ->whereRaw('COALESCE(paid_amount, 0) < COALESCE(total_amount, 0)')
                ->count(),
            'totalRevenue' => (float) (clone $baseQuery)->sum('total_amount'),
        ];
    }
    
}
