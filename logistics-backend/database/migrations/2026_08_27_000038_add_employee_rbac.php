<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            if (! Schema::hasColumn('roles', 'key')) {
                $table->string('key', 50)->nullable()->unique()->after('id');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'department')) {
                $table->string('department', 50)->nullable()->after('address');
            }
        });

        $definitions = $this->roleDefinitions();
        $roles = DB::table('roles')->get();

        foreach ($definitions as $key => $definition) {
            $aliases = array_map([$this, 'normalize'], [...$definition['aliases'], $definition['name'], $key]);
            $matches = $roles->filter(fn (object $role) => $role->key === $key
                || in_array($this->normalize((string) $role->name), $aliases, true));
            $canonical = $matches->first(fn (object $role) => $role->key === $key)
                ?? $matches->first(fn (object $role) => $this->normalize((string) $role->name) === $this->normalize($definition['name']))
                ?? $matches->first();

            if ($canonical) {
                $roleId = $canonical->id;
                DB::table('roles')->where('id', $roleId)->update([
                    'key' => $key,
                    'name' => $definition['name'],
                    'permissions' => json_encode($definition['permissions'], JSON_UNESCAPED_UNICODE),
                    'updated_at' => now(),
                ]);
            } else {
                $roleId = DB::table('roles')->insertGetId([
                    'key' => $key,
                    'name' => $definition['name'],
                    'permissions' => json_encode($definition['permissions'], JSON_UNESCAPED_UNICODE),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            $legacyIds = $matches->pluck('id')->filter(fn ($id) => (int) $id !== (int) $roleId)->all();
            if ($legacyIds !== []) {
                DB::table('users')->whereIn('role_id', $legacyIds)->update(['role_id' => $roleId]);
            }

            DB::table('users')
                ->where('role_id', $roleId)
                ->whereNull('department')
                ->update(['department' => $definition['department']]);

            $roles = DB::table('roles')->get();
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'department')) {
                $table->dropColumn('department');
            }
        });

        Schema::table('roles', function (Blueprint $table) {
            if (Schema::hasColumn('roles', 'key')) {
                $table->dropUnique('roles_key_unique');
                $table->dropColumn('key');
            }
        });
    }

    private function normalize(string $value): string
    {
        return strtolower(trim($value));
    }

    private function roleDefinitions(): array
    {
        return [
            'admin' => [
                'name' => 'Quản trị viên', 'department' => 'administration',
                'aliases' => ['Admin', 'Administrator'], 'permissions' => ['all'],
            ],
            'sales_staff' => [
                'name' => 'Nhân viên kinh doanh', 'department' => 'sales', 'aliases' => ['staff', 'Sales Staff'],
                'permissions' => ['customers.read', 'customers.create', 'customers.update', 'orders.read', 'orders.create', 'orders.update'],
            ],
            'customer_service' => [
                'name' => 'Chăm sóc khách hàng', 'department' => 'customer_service', 'aliases' => ['Customer Service', 'CSKH'],
                'permissions' => ['customers.read', 'customers.update', 'orders.read'],
            ],
            'china_warehouse_staff' => [
                'name' => 'Nhân viên kho Trung Quốc', 'department' => 'china_warehouse', 'aliases' => ['Warehouse Staff', 'China Warehouse Staff'],
                'permissions' => ['cn_packages.read', 'cn_packages.create', 'cn_packages.update', 'cn_packages.inspect', 'cn_batches.read', 'cn_batches.create', 'cn_batches.update', 'cn_batches.dispatch'],
            ],
            'vietnam_warehouse_staff' => [
                'name' => 'Nhân viên kho Việt Nam', 'department' => 'vietnam_warehouse', 'aliases' => ['Vietnam Warehouse Staff'],
                'permissions' => ['vn_warehouse.read', 'vn_warehouse.receive', 'vn_warehouse.scan', 'vn_warehouse.inspect', 'vn_warehouse.resolve_discrepancy'],
            ],
            'accountant' => [
                'name' => 'Kế toán', 'department' => 'accounting', 'aliases' => ['Accountant'],
                'permissions' => ['payment_vouchers.read', 'payment_vouchers.create', 'payment_vouchers.update', 'payment_vouchers.confirm', 'invoices.read', 'invoices.create', 'invoices.update', 'payments.read', 'payments.confirm', 'shipping_rates.read', 'shipping_rates.update', 'exchange_rates.read', 'exchange_rates.update', 'revenue_report.read'],
            ],
            'shipping_staff' => [
                'name' => 'Nhân viên xuất hàng', 'department' => 'shipping', 'aliases' => ['Delivery Staff', 'Shipping Staff'],
                'permissions' => ['shipping_queue.read', 'shipping_tasks.read', 'shipping_tasks.create', 'shipping_tasks.update', 'shipping_tasks.complete', 'export_slips.read', 'export_slips.create', 'export_slips.update'],
            ],
        ];
    }
};
