<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class RolesAndTestEmployeesSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'development', 'testing'])) {
            throw new RuntimeException('Test employee accounts may only be seeded in local, development, or testing environments.');
        }

        DB::transaction(function () {
            $roles = [];

            foreach ($this->roleDefinitions() as $key => $definition) {
                $roles[$key] = Role::query()->updateOrCreate(
                    ['key' => $key],
                    [
                        'name' => $definition['name'],
                        'description' => $definition['description'],
                        'permissions' => $definition['permissions'],
                    ],
                );
            }

            foreach ($this->employeeDefinitions() as $employee) {
                User::query()->updateOrCreate(
                    ['email' => $employee['email']],
                    [
                        'name' => $employee['name'],
                        'password' => Hash::make('123456'),
                        'department' => $employee['department'],
                        'role_id' => $roles[$employee['role_key']]->id,
                        'status' => $employee['status'],
                    ],
                );
            }
        });
    }

    private function roleDefinitions(): array
    {
        return [
            'admin' => [
                'name' => 'Quản trị viên',
                'description' => 'Quản trị hệ thống, nhân sự, phân quyền và toàn bộ nghiệp vụ vận hành.',
                'permissions' => ['all'],
            ],
            'sales_staff' => [
                'name' => 'Nhân viên kinh doanh',
                'description' => 'Tìm kiếm và chăm sóc khách hàng, tạo đơn hàng và theo dõi tiến độ đơn phụ trách.',
                'permissions' => [
                    'customers.read', 'customers.create', 'customers.update',
                    'orders.read', 'orders.create', 'orders.update',
                ],
            ],
            'customer_service' => [
                'name' => 'Chăm sóc khách hàng',
                'description' => 'Hỗ trợ khách hàng, cập nhật thông tin và theo dõi trạng thái đơn hàng.',
                'permissions' => ['customers.read', 'customers.update', 'orders.read'],
            ],
            'china_warehouse_staff' => [
                'name' => 'Nhân viên kho Trung Quốc',
                'description' => 'Tiếp nhận, kiểm tra kiện hàng tại kho Trung Quốc và quản lý các lô xuất kho.',
                'permissions' => [
                    'cn_packages.read', 'cn_packages.create', 'cn_packages.update', 'cn_packages.inspect',
                    'cn_batches.read', 'cn_batches.create', 'cn_batches.update', 'cn_batches.dispatch',
                ],
            ],
            'vietnam_warehouse_staff' => [
                'name' => 'Nhân viên kho Việt Nam',
                'description' => 'Tiếp nhận, scan, kiểm hàng và xử lý sai lệch tại kho Việt Nam.',
                'permissions' => [
                    'vn_warehouse.read', 'vn_warehouse.receive', 'vn_warehouse.scan',
                    'vn_warehouse.inspect', 'vn_warehouse.resolve_discrepancy',
                ],
            ],
            'accountant' => [
                'name' => 'Kế toán',
                'description' => 'Quản lý phiếu thanh toán, giao dịch, hóa đơn, bảng giá và báo cáo doanh thu.',
                'permissions' => [
                    'payment_vouchers.read', 'payment_vouchers.create', 'payment_vouchers.update',
                    'payment_vouchers.confirm', 'payments.read', 'payments.confirm',
                    'invoices.read', 'invoices.create', 'invoices.update',
                    'shipping_rates.read', 'shipping_rates.update',
                    'exchange_rates.read', 'exchange_rates.update', 'revenue_report.read',
                ],
            ],
            'shipping_staff' => [
                'name' => 'Nhân viên xuất hàng',
                'description' => 'Quản lý hàng chờ xuất, nhiệm vụ giao hàng và phiếu xuất kho.',
                'permissions' => [
                    'shipping_queue.read',
                    'shipping_tasks.read', 'shipping_tasks.create', 'shipping_tasks.update',
                    'shipping_tasks.complete',
                    'export_slips.read', 'export_slips.create', 'export_slips.update',
                ],
            ],
        ];
    }

    private function employeeDefinitions(): array
    {
        return [
            ['name' => 'Admin Test', 'email' => 'admin@test.com', 'department' => 'administration', 'role_key' => 'admin', 'status' => 'active'],
            ['name' => 'Nhân viên Kinh doanh', 'email' => 'sales@test.com', 'department' => 'sales', 'role_key' => 'sales_staff', 'status' => 'active'],
            ['name' => 'Nhân viên CSKH', 'email' => 'cskh@test.com', 'department' => 'customer_service', 'role_key' => 'customer_service', 'status' => 'active'],
            ['name' => 'Nhân viên Kho Trung Quốc', 'email' => 'khotq@test.com', 'department' => 'china_warehouse', 'role_key' => 'china_warehouse_staff', 'status' => 'active'],
            ['name' => 'Nhân viên Kho Việt Nam', 'email' => 'khovn@test.com', 'department' => 'vietnam_warehouse', 'role_key' => 'vietnam_warehouse_staff', 'status' => 'active'],
            ['name' => 'Nhân viên Kế toán', 'email' => 'ketoan@test.com', 'department' => 'accounting', 'role_key' => 'accountant', 'status' => 'active'],
            ['name' => 'Nhân viên Xuất hàng', 'email' => 'xuathang@test.com', 'department' => 'shipping', 'role_key' => 'shipping_staff', 'status' => 'active'],
            ['name' => 'Test Locked', 'email' => 'locked@test.com', 'department' => 'sales', 'role_key' => 'sales_staff', 'status' => 'locked'],
            ['name' => 'Test Inactive', 'email' => 'inactive@test.com', 'department' => 'sales', 'role_key' => 'sales_staff', 'status' => 'inactive'],
        ];
    }
}
