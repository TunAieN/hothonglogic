<?php

namespace App\Services\Reports;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class RevenueReportService
{
    private const VALID_INVOICE_STATUSES = ['issued', 'confirmed'];

    private const EXCLUDED_VOUCHER_TYPES = ['deposit'];

    public function getReport(array $input): array
    {
        [$from, $to] = $this->dateRange($input);
        [$previousFrom, $previousTo] = $this->previousPeriod($from, $to);
        $groupBy = $this->groupBy($input['groupBy'] ?? 'DAY');
        $warehouseId = $input['warehouseId'] ?? null;
        $revenueType = $this->revenueType($input['revenueType'] ?? null);
        $detailPage = max(1, (int) ($input['detailPage'] ?? 1));
        $detailPageSize = min(100, max(5, (int) ($input['detailPageSize'] ?? 10)));
        $detailSortField = $input['detailSortField'] ?? 'period';
        $detailSortDirection = strtolower((string) ($input['detailSortDirection'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';

        $currentSummary = $this->summary($from, $to, $warehouseId, $revenueType);
        $previousSummary = $this->summary($previousFrom, $previousTo, $warehouseId, $revenueType);
        $timeline = $this->timeline($from, $to, $previousFrom, $previousTo, $groupBy, $warehouseId, $revenueType);
        $warehouses = $this->warehouses($from, $to, $revenueType);
        $services = $this->services($from, $to, $warehouseId);
        $details = $this->details(
            $from,
            $to,
            $groupBy,
            $warehouseId,
            $revenueType,
            $detailPage,
            $detailPageSize,
            $detailSortField,
            $detailSortDirection
        );

        return [
            'summary' => $this->buildSummary($currentSummary, $previousSummary, $from, $to, $previousFrom, $previousTo),
            'timeline' => $timeline,
            'warehouses' => $warehouses,
            'services' => $services,
            'details' => $details['rows'],
            'detailPagination' => [
                'currentPage' => $detailPage,
                'perPage' => $detailPageSize,
                'total' => $details['total'],
                'lastPage' => (int) max(1, ceil($details['total'] / $detailPageSize)),
            ],
            'notes' => [
                'Doanh thu được tính từ invoice_items.amount của hóa đơn issued/confirmed, loại trừ voucher đặt cọc.',
                'Đã thu lấy từ invoices.paid_amount đã phát hành; giao dịch confirmed là nguồn cập nhật paid_amount hiện tại.',
                'Chưa phát hiện bảng chi phí thực tế, vì vậy chi phí và lợi nhuận trả về null.',
            ],
        ];
    }

    public function drilldown(array $input, string $periodKey): array
    {
        [$from, $to] = $this->dateRange($input);
        $groupBy = $this->groupBy($input['groupBy'] ?? 'DAY');
        $warehouseId = $input['warehouseId'] ?? null;
        $revenueType = $this->revenueType($input['revenueType'] ?? null);
        $dateExpression = $this->dateExpression($groupBy);

        $rows = $this->baseInvoiceQuery($from, $to, $warehouseId, $revenueType)
            ->select([
                'invoices.id',
                'invoices.invoice_code',
                'invoices.issued_at',
                'invoices.total_amount',
                'invoices.paid_amount',
                'payment_vouchers.voucher_code',
                'orders.id as order_id',
                'orders.order_code',
                'customers.name as customer_name',
            ])
            ->leftJoin('customers', 'customers.id', '=', 'invoices.customer_id')
            ->leftJoin('payment_voucher_packages', 'payment_voucher_packages.payment_voucher_id', '=', 'payment_vouchers.id')
            ->leftJoin('orders', 'orders.id', '=', 'payment_voucher_packages.order_id')
            ->whereRaw($dateExpression.' = ?', [$periodKey])
            ->groupBy([
                'invoices.id',
                'invoices.invoice_code',
                'invoices.issued_at',
                'invoices.total_amount',
                'invoices.paid_amount',
                'payment_vouchers.voucher_code',
                'orders.id',
                'orders.order_code',
                'customers.name',
            ])
            ->orderByDesc('invoices.issued_at')
            ->limit(100)
            ->get();

        return $rows->map(fn ($row) => [
            'invoiceId' => (string) $row->id,
            'invoiceCode' => $row->invoice_code,
            'voucherCode' => $row->voucher_code,
            'orderId' => $row->order_id ? (string) $row->order_id : null,
            'orderCode' => $row->order_code,
            'customerName' => $row->customer_name,
            'issuedAt' => $row->issued_at,
            'revenue' => (float) $row->total_amount,
            'paid' => (float) $row->paid_amount,
        ])->all();
    }

    private function buildSummary(array $current, array $previous, CarbonInterface $from, CarbonInterface $to, CarbonInterface $previousFrom, CarbonInterface $previousTo): array
    {
        return [
            'revenue' => $this->metric((float) $current['revenue'], (float) $previous['revenue']),
            'paid' => $this->metric((float) $current['paid'], (float) $previous['paid']),
            'cost' => $this->metric(null, null),
            'profit' => $this->metric(null, null),
            'orders' => $this->metric((float) $current['orders'], (float) $previous['orders']),
            'paidRate' => $current['revenue'] > 0 ? round($current['paid'] / $current['revenue'] * 100, 2) : null,
            'dateFrom' => $from->toDateString(),
            'dateTo' => $to->toDateString(),
            'previousDateFrom' => $previousFrom->toDateString(),
            'previousDateTo' => $previousTo->toDateString(),
        ];
    }

    private function summary(CarbonInterface $from, CarbonInterface $to, mixed $warehouseId, ?string $revenueType): array
    {
        $totals = $this->baseRevenueQuery($from, $to, $warehouseId, $revenueType)
            ->selectRaw('COALESCE(SUM(invoice_items.amount), 0) as revenue')
            ->selectRaw('COUNT(DISTINCT COALESCE(payment_voucher_packages.order_id, payment_vouchers.id)) as orders')
            ->first();

        $paid = $this->baseInvoiceQuery($from, $to, $warehouseId, $revenueType)
            ->selectRaw('COALESCE(SUM(invoices.paid_amount), 0) as paid')
            ->value('paid');

        return [
            'revenue' => (float) ($totals->revenue ?? 0),
            'paid' => (float) ($paid ?? 0),
            'orders' => (int) ($totals->orders ?? 0),
        ];
    }

    private function timeline(CarbonInterface $from, CarbonInterface $to, CarbonInterface $previousFrom, CarbonInterface $previousTo, string $groupBy, mixed $warehouseId, ?string $revenueType): array
    {
        $current = $this->groupedRevenue($from, $to, $groupBy, $warehouseId, $revenueType);
        $previous = $this->groupedRevenue($previousFrom, $previousTo, $groupBy, $warehouseId, $revenueType);
        $currentKeys = $this->periodKeys($from, $to, $groupBy);
        $previousKeys = $this->periodKeys($previousFrom, $previousTo, $groupBy);

        return array_map(function ($periodKey, $index) use ($current, $previous, $previousKeys, $groupBy) {
            $revenue = (float) ($current[$periodKey] ?? 0);
            $previousPeriodKey = $previousKeys[$index] ?? null;
            $previousRevenue = $previousPeriodKey ? (float) ($previous[$previousPeriodKey] ?? 0) : 0.0;

            return [
                'periodKey' => $periodKey,
                'label' => $this->periodLabel($periodKey, $groupBy),
                'revenue' => $revenue,
                'previousRevenue' => $previousRevenue,
                'changePercent' => $this->percentageChange($revenue, $previousRevenue),
            ];
        }, $currentKeys, array_keys($currentKeys));
    }

    private function warehouses(CarbonInterface $from, CarbonInterface $to, ?string $revenueType): array
    {
        $rows = $this->baseRevenueQuery($from, $to, null, $revenueType)
            ->selectRaw('COALESCE(vn_warehouses.id, 0) as warehouse_id')
            ->selectRaw("COALESCE(vn_warehouses.name, 'Chưa xác định') as warehouse_name")
            ->selectRaw('COALESCE(SUM(invoice_items.amount), 0) as revenue')
            ->leftJoin('vn_warehouses', 'vn_warehouses.id', '=', 'payment_vouchers.vn_warehouse_id')
            ->groupBy('vn_warehouses.id', 'vn_warehouses.name')
            ->orderByDesc('revenue')
            ->get();

        $total = max(0.0, (float) $rows->sum('revenue'));

        return $rows->map(fn ($row) => [
            'warehouseId' => (string) $row->warehouse_id,
            'warehouseName' => $row->warehouse_name,
            'revenue' => (float) $row->revenue,
            'percent' => $total > 0 ? round((float) $row->revenue / $total * 100, 2) : 0.0,
        ])->all();
    }

    private function services(CarbonInterface $from, CarbonInterface $to, mixed $warehouseId): array
    {
        $rows = $this->baseRevenueQuery($from, $to, $warehouseId, null)
            ->selectRaw('invoice_items.item_type as service_type')
            ->selectRaw('COALESCE(SUM(invoice_items.amount), 0) as revenue')
            ->groupBy('invoice_items.item_type')
            ->orderByDesc('revenue')
            ->get();

        $total = max(0.0, (float) $rows->sum('revenue'));

        return $rows->map(fn ($row) => [
            'serviceType' => $row->service_type,
            'serviceName' => $this->serviceName($row->service_type),
            'revenue' => (float) $row->revenue,
            'percent' => $total > 0 ? round((float) $row->revenue / $total * 100, 2) : 0.0,
        ])->all();
    }

    private function details(CarbonInterface $from, CarbonInterface $to, string $groupBy, mixed $warehouseId, ?string $revenueType, int $page, int $pageSize, string $sortField, string $sortDirection): array
    {
        $dateExpression = $this->dateExpression($groupBy);
        $query = $this->baseRevenueQuery($from, $to, $warehouseId, $revenueType)
            ->selectRaw($dateExpression.' as period_key')
            ->selectRaw('COUNT(DISTINCT COALESCE(payment_voucher_packages.order_id, payment_vouchers.id)) as order_count')
            ->selectRaw('COALESCE(SUM(invoice_items.amount), 0) as revenue')
            ->selectRaw("COALESCE(SUM(CASE WHEN invoice_items.item_type = 'shipping_fee' THEN invoice_items.amount ELSE 0 END), 0) as shipping_fee")
            ->selectRaw("COALESCE(SUM(CASE WHEN invoice_items.item_type = 'surcharge' THEN invoice_items.amount ELSE 0 END), 0) as surcharge")
            ->groupBy('period_key');

        $paidByPeriod = $this->baseInvoiceQuery($from, $to, $warehouseId, $revenueType)
            ->selectRaw($dateExpression.' as period_key')
            ->selectRaw('COALESCE(SUM(invoices.paid_amount), 0) as paid')
            ->groupBy('period_key')
            ->pluck('paid', 'period_key');

        $allRows = $query->get()->map(fn ($row) => [
            'periodKey' => $row->period_key,
            'label' => $this->periodLabel($row->period_key, $groupBy),
            'orderCount' => (int) $row->order_count,
            'revenue' => (float) $row->revenue,
            'paid' => (float) ($paidByPeriod[$row->period_key] ?? 0),
            'shippingFee' => (float) $row->shipping_fee,
            'domesticShippingFee' => null,
            'surcharge' => (float) $row->surcharge,
            'discount' => null,
            'cost' => null,
            'profit' => null,
        ]);

        $sortMap = [
            'period' => 'periodKey',
            'orders' => 'orderCount',
            'revenue' => 'revenue',
            'paid' => 'paid',
        ];
        $sortKey = $sortMap[$sortField] ?? 'periodKey';
        $sorted = $allRows->sortBy($sortKey, SORT_REGULAR, $sortDirection === 'desc')->values();

        return [
            'total' => $sorted->count(),
            'rows' => $sorted->forPage($page, $pageSize)->values()->all(),
        ];
    }

    private function groupedRevenue(CarbonInterface $from, CarbonInterface $to, string $groupBy, mixed $warehouseId, ?string $revenueType): array
    {
        $dateExpression = $this->dateExpression($groupBy);

        return $this->baseRevenueQuery($from, $to, $warehouseId, $revenueType)
            ->selectRaw($dateExpression.' as period_key')
            ->selectRaw('COALESCE(SUM(invoice_items.amount), 0) as revenue')
            ->groupBy('period_key')
            ->orderBy('period_key')
            ->pluck('revenue', 'period_key')
            ->map(fn ($value) => (float) $value)
            ->all();
    }

    private function baseRevenueQuery(CarbonInterface $from, CarbonInterface $to, mixed $warehouseId, ?string $revenueType)
    {
        return InvoiceItem::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_items.invoice_id')
            ->join('payment_vouchers', 'payment_vouchers.id', '=', 'invoices.payment_voucher_id')
            ->leftJoin('payment_voucher_packages', 'payment_voucher_packages.id', '=', 'invoice_items.payment_voucher_package_id')
            ->whereBetween('invoices.issued_at', [$from->startOfDay(), $to->endOfDay()])
            ->whereIn('invoices.status', self::VALID_INVOICE_STATUSES)
            ->whereNotIn('payment_vouchers.voucher_type', self::EXCLUDED_VOUCHER_TYPES)
            ->when($warehouseId, fn ($query) => $query->where('payment_vouchers.vn_warehouse_id', $warehouseId))
            ->when($revenueType, fn ($query) => $query->where('invoice_items.item_type', $revenueType));
    }

    private function baseInvoiceQuery(CarbonInterface $from, CarbonInterface $to, mixed $warehouseId, ?string $revenueType)
    {
        return Invoice::query()
            ->join('payment_vouchers', 'payment_vouchers.id', '=', 'invoices.payment_voucher_id')
            ->whereBetween('invoices.issued_at', [$from->startOfDay(), $to->endOfDay()])
            ->whereIn('invoices.status', self::VALID_INVOICE_STATUSES)
            ->whereNotIn('payment_vouchers.voucher_type', self::EXCLUDED_VOUCHER_TYPES)
            ->when($warehouseId, fn ($query) => $query->where('payment_vouchers.vn_warehouse_id', $warehouseId))
            ->when($revenueType, fn ($query) => $query->whereExists(function ($exists) use ($revenueType) {
                $exists->select(DB::raw(1))
                    ->from('invoice_items')
                    ->whereColumn('invoice_items.invoice_id', 'invoices.id')
                    ->where('invoice_items.item_type', $revenueType);
            }));
    }

    private function dateExpression(string $groupBy): string
    {
        return match ($groupBy) {
            'WEEK' => "DATE_FORMAT(invoices.issued_at, '%x-W%v')",
            'MONTH' => "DATE_FORMAT(invoices.issued_at, '%Y-%m')",
            'QUARTER' => "CONCAT(YEAR(invoices.issued_at), '-Q', QUARTER(invoices.issued_at))",
            'YEAR' => "DATE_FORMAT(invoices.issued_at, '%Y')",
            default => 'DATE(invoices.issued_at)',
        };
    }

    private function periodKeys(CarbonInterface $from, CarbonInterface $to, string $groupBy): array
    {
        $keys = [];
        $cursor = $from->copy()->startOfDay();
        $end = $to->copy()->startOfDay();

        while ($cursor <= $end) {
            $key = match ($groupBy) {
                'WEEK' => $cursor->isoFormat('GGGG-[W]WW'),
                'MONTH' => $cursor->format('Y-m'),
                'QUARTER' => $cursor->format('Y').'-Q'.$cursor->quarter,
                'YEAR' => $cursor->format('Y'),
                default => $cursor->toDateString(),
            };
            $keys[$key] = $key;
            $cursor = match ($groupBy) {
                'WEEK' => $cursor->addWeek()->startOfWeek(),
                'MONTH' => $cursor->addMonth()->startOfMonth(),
                'QUARTER' => $cursor->addQuarter()->firstOfQuarter(),
                'YEAR' => $cursor->addYear()->startOfYear(),
                default => $cursor->addDay(),
            };
        }

        return array_values($keys);
    }

    private function periodLabel(string $periodKey, string $groupBy): string
    {
        if ($groupBy === 'DAY') {
            return Carbon::parse($periodKey)->format('d/m/Y');
        }

        return $periodKey;
    }

    private function metric(?float $current, ?float $previous): array
    {
        return [
            'current' => $current,
            'previous' => $previous,
            'changePercent' => $current === null || $previous === null ? null : $this->percentageChange($current, $previous),
        ];
    }

    private function percentageChange(float $current, float $previous): ?float
    {
        if (abs($previous) < 0.00001) {
            return abs($current) < 0.00001 ? 0.0 : null;
        }

        return round(($current - $previous) / $previous * 100, 2);
    }

    private function previousPeriod(CarbonInterface $from, CarbonInterface $to): array
    {
        $days = $from->diffInDays($to) + 1;
        $previousTo = $from->copy()->subDay()->endOfDay();
        $previousFrom = $previousTo->copy()->subDays($days - 1)->startOfDay();

        return [$previousFrom, $previousTo];
    }

    private function dateRange(array $input): array
    {
        $from = Carbon::parse($input['dateFrom'] ?? now()->startOfMonth())->startOfDay();
        $to = Carbon::parse($input['dateTo'] ?? now())->endOfDay();

        if ($to->lt($from)) {
            return [$to, $from];
        }

        return [$from, $to];
    }

    private function groupBy(string $value): string
    {
        $normalized = strtoupper($value);

        return in_array($normalized, ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'], true) ? $normalized : 'DAY';
    }

    private function revenueType(?string $value): ?string
    {
        $normalized = trim((string) $value);

        return $normalized === '' || $normalized === 'all' ? null : $normalized;
    }

    private function serviceName(?string $serviceType): string
    {
        return match ($serviceType) {
            'shipping_fee' => 'Phí vận chuyển',
            'surcharge' => 'Phụ phí',
            default => $serviceType ?: 'Khác',
        };
    }
}
