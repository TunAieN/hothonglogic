<?php

namespace App\GraphQL\Resolvers;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class EmployeeDetailResolver
{
    public function statistics($_, array $args): array
    {
        $employee = User::query()->with('role')->findOrFail($args['employee_id']);

        return match ($employee->role?->key) {
            'sales_staff', 'customer_service' => $this->salesStatistics($employee),
            'china_warehouse_staff' => $this->chinaWarehouseStatistics($employee),
            'vietnam_warehouse_staff' => $this->vietnamWarehouseStatistics($employee),
            'accountant' => $this->accountingStatistics($employee),
            'shipping_staff' => $this->shippingStatistics($employee),
            'admin' => $this->administrationStatistics(),
            default => $this->activityStatistics($employee),
        };
    }

    public function activity($_, array $args)
    {
        User::query()->findOrFail($args['employee_id']);

        if (! Schema::hasTable('audit_logs')) {
            return collect();
        }

        return AuditLog::query()
            ->where('user_id', $args['employee_id'])
            ->latest('created_at')
            ->limit(50)
            ->get();
    }

    private function salesStatistics(User $employee): array
    {
        $orders = $this->ownedQuery('orders', $employee->id, ['account_manager_id', 'created_by']);
        $totalOrders = $orders ? (clone $orders)->count() : 0;
        $completedOrders = $orders && Schema::hasColumn('orders', 'status')
            ? (clone $orders)->whereIn('status', ['completed', 'delivered'])->count()
            : 0;
        $processingOrders = $orders && Schema::hasColumn('orders', 'status')
            ? (clone $orders)->whereNotIn('status', ['completed', 'delivered', 'cancelled'])->count()
            : 0;
        $customers = $orders && Schema::hasColumn('orders', 'customer_id')
            ? (clone $orders)->whereNotNull('customer_id')->distinct()->count('customer_id')
            : 0;

        return [
            $this->item('total_orders', 'Tổng đơn hàng', $totalOrders, 'Đơn hàng'),
            $this->item('total_customers', 'Khách hàng phụ trách', $customers, 'Khách hàng'),
            $this->item('processing_orders', 'Đơn đang xử lý', $processingOrders, 'Đơn hàng'),
            $this->item('completion_rate', 'Tỷ lệ hoàn thành', $this->percentage($completedOrders, $totalOrders), '%'),
        ];
    }

    private function chinaWarehouseStatistics(User $employee): array
    {
        $packages = $this->ownedQuery('cn_packages', $employee->id, ['created_by']);
        $processed = $packages ? (clone $packages)->count() : 0;
        $today = $packages && Schema::hasColumn('cn_packages', 'created_at')
            ? (clone $packages)->whereDate('created_at', today())->count()
            : 0;
        $errors = $packages && Schema::hasColumn('cn_packages', 'package_condition')
            ? (clone $packages)->whereNotNull('package_condition')->whereNotIn('package_condition', ['', 'normal', 'good'])->count()
            : 0;
        $batches = $packages && Schema::hasTable('cn_batch_packages')
            ? DB::table('cn_batch_packages')
                ->join('cn_packages', 'cn_packages.id', '=', 'cn_batch_packages.cn_package_id')
                ->where('cn_packages.created_by', $employee->id)
                ->distinct()
                ->count('cn_batch_packages.cn_batch_id')
            : 0;

        return [
            $this->item('processed_packages', 'Kiện đã xử lý', $processed, 'Kiện'),
            $this->item('related_batches', 'Lô liên quan', $batches, 'Lô hàng'),
            $this->item('error_packages', 'Kiện bất thường', $errors, 'Kiện'),
            $this->item('today_packages', 'Kiện hôm nay', $today, 'Kiện'),
        ];
    }

    private function vietnamWarehouseStatistics(User $employee): array
    {
        $packages = $this->ownedQuery('vn_packages', $employee->id, ['handled_by']);
        $scanned = $packages && Schema::hasColumn('vn_packages', 'scanned_at')
            ? (clone $packages)->whereNotNull('scanned_at')->count()
            : 0;
        $inspected = $packages && Schema::hasColumn('vn_packages', 'inspection_status')
            ? (clone $packages)->where('inspection_status', 'inspected')->count()
            : 0;
        $discrepancies = $packages && Schema::hasColumn('vn_packages', 'inspection_status')
            ? (clone $packages)->whereIn('inspection_status', ['damaged', 'missing', 'extra', 'mismatched'])->count()
            : 0;
        $today = $packages && Schema::hasColumn('vn_packages', 'scanned_at')
            ? (clone $packages)->whereDate('scanned_at', today())->count()
            : 0;

        return [
            $this->item('scanned_packages', 'Kiện đã scan', $scanned, 'Kiện'),
            $this->item('inspected_packages', 'Kiện đã kiểm', $inspected, 'Kiện'),
            $this->item('discrepancies', 'Kiện sai lệch', $discrepancies, 'Kiện'),
            $this->item('today_packages', 'Kiện hôm nay', $today, 'Kiện'),
        ];
    }

    private function accountingStatistics(User $employee): array
    {
        $vouchers = $this->ownedQuery('payment_vouchers', $employee->id, ['created_by']);
        $transactions = $this->ownedQuery('payment_transactions', $employee->id, ['confirmed_by']);
        $invoices = $this->ownedQuery('invoices', $employee->id, ['confirmed_by', 'issued_by', 'created_by']);
        $confirmedValue = $transactions && Schema::hasColumn('payment_transactions', 'amount')
            ? (float) (clone $transactions)->sum('amount')
            : 0;

        return [
            $this->item('payment_vouchers', 'Phiếu đã xử lý', $vouchers ? (clone $vouchers)->count() : 0, 'Phiếu'),
            $this->item('confirmed_invoices', 'Hóa đơn xác nhận', $invoices ? (clone $invoices)->count() : 0, 'Hóa đơn'),
            $this->item('confirmed_transactions', 'Giao dịch xử lý', $transactions ? (clone $transactions)->count() : 0, 'Giao dịch'),
            $this->item('confirmed_value', 'Tổng giá trị xác nhận', number_format($confirmedValue, 0, ',', '.'), 'VND'),
        ];
    }

    private function shippingStatistics(User $employee): array
    {
        $tasks = $this->ownedQuery('shipping_tasks', $employee->id, ['delivery_staff_id', 'created_by']);
        $total = $tasks ? (clone $tasks)->count() : 0;
        $completed = $tasks && Schema::hasColumn('shipping_tasks', 'status')
            ? (clone $tasks)->where('status', 'completed')->count()
            : 0;
        $processing = $tasks && Schema::hasColumn('shipping_tasks', 'status')
            ? (clone $tasks)->whereIn('status', ['created', 'preparing', 'in_transit'])->count()
            : 0;
        $slips = $this->ownedQuery('exports', $employee->id, ['delivery_staff_id', 'created_by']);

        return [
            $this->item('completed_tasks', 'Nhiệm vụ đã xử lý', $completed, 'Nhiệm vụ'),
            $this->item('processing_tasks', 'Nhiệm vụ đang làm', $processing, 'Nhiệm vụ'),
            $this->item('export_slips', 'Phiếu xuất', $slips ? (clone $slips)->count() : 0, 'Phiếu'),
            $this->item('completion_rate', 'Tỷ lệ hoàn thành', $this->percentage($completed, $total), '%'),
        ];
    }

    private function administrationStatistics(): array
    {
        $employeeQuery = User::query()->whereHas('role', fn ($query) => $query->whereNotNull('key'));

        return [
            $this->item('total_employees', 'Tổng nhân viên', (clone $employeeQuery)->count(), 'Nhân viên'),
            $this->item('active_employees', 'Đang hoạt động', (clone $employeeQuery)->where('status', 'active')->count(), 'Nhân viên'),
            $this->item('locked_employees', 'Đang tạm khóa', (clone $employeeQuery)->where('status', 'locked')->count(), 'Nhân viên'),
            $this->item('inactive_employees', 'Đã nghỉ việc', (clone $employeeQuery)->where('status', 'inactive')->count(), 'Nhân viên'),
        ];
    }

    private function activityStatistics(User $employee): array
    {
        $activity = Schema::hasTable('audit_logs')
            ? DB::table('audit_logs')->where('user_id', $employee->id)
            : null;

        return [
            $this->item('activities', 'Hoạt động ghi nhận', $activity ? (clone $activity)->count() : 0, 'Hoạt động'),
            $this->item('today_activities', 'Hoạt động hôm nay', $activity ? (clone $activity)->whereDate('created_at', today())->count() : 0, 'Hoạt động'),
        ];
    }

    private function ownedQuery(string $table, int $employeeId, array $columns): ?Builder
    {
        if (! Schema::hasTable($table)) {
            return null;
        }

        $availableColumns = array_values(array_filter(
            $columns,
            fn (string $column): bool => Schema::hasColumn($table, $column),
        ));

        if ($availableColumns === []) {
            return null;
        }

        return DB::table($table)->where(function (Builder $query) use ($availableColumns, $employeeId) {
            foreach ($availableColumns as $index => $column) {
                $method = $index === 0 ? 'where' : 'orWhere';
                $query->{$method}($column, $employeeId);
            }
        });
    }

    private function percentage(int $completed, int $total): string
    {
        return $total > 0 ? number_format(($completed / $total) * 100, 1, '.', '') : '0';
    }

    private function item(string $key, string $label, int|float|string $value, ?string $suffix = null): array
    {
        return [
            'key' => $key,
            'label' => $label,
            'value' => (string) $value,
            'suffix' => $suffix,
        ];
    }
}
