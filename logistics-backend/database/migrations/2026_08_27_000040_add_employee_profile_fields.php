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
            if (! Schema::hasColumn('roles', 'description')) {
                $table->text('description')->nullable()->after('name');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'birthday')) {
                $table->date('birthday')->nullable()->after('address');
            }

            if (! Schema::hasColumn('users', 'gender')) {
                $table->string('gender', 20)->nullable()->after('birthday');
            }

            if (! Schema::hasColumn('users', 'note')) {
                $table->text('note')->nullable()->after('gender');
            }

            if (! Schema::hasColumn('users', 'joined_at')) {
                $table->date('joined_at')->nullable()->after('department');
            }

            if (! Schema::hasColumn('users', 'manager_id')) {
                $table->foreignId('manager_id')
                    ->nullable()
                    ->after('joined_at')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });

        foreach ($this->roleDescriptions() as $key => $description) {
            DB::table('roles')->where('key', $key)->update(['description' => $description]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'manager_id')) {
                $table->dropConstrainedForeignId('manager_id');
            }

            $columns = array_values(array_filter(
                ['birthday', 'gender', 'note', 'joined_at'],
                fn (string $column): bool => Schema::hasColumn('users', $column),
            ));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });

        Schema::table('roles', function (Blueprint $table) {
            if (Schema::hasColumn('roles', 'description')) {
                $table->dropColumn('description');
            }
        });
    }

    private function roleDescriptions(): array
    {
        return [
            'admin' => 'Quản trị hệ thống, nhân sự, phân quyền và toàn bộ nghiệp vụ vận hành.',
            'sales_staff' => 'Tìm kiếm và chăm sóc khách hàng, tạo đơn hàng và theo dõi tiến độ đơn phụ trách.',
            'customer_service' => 'Hỗ trợ khách hàng, cập nhật thông tin và theo dõi trạng thái đơn hàng.',
            'china_warehouse_staff' => 'Tiếp nhận, kiểm tra kiện hàng tại kho Trung Quốc và quản lý các lô xuất kho.',
            'vietnam_warehouse_staff' => 'Tiếp nhận, scan, kiểm hàng và xử lý sai lệch tại kho Việt Nam.',
            'accountant' => 'Quản lý phiếu thanh toán, giao dịch, hóa đơn, bảng giá và báo cáo doanh thu.',
            'shipping_staff' => 'Quản lý hàng chờ xuất, nhiệm vụ giao hàng và phiếu xuất kho.',
        ];
    }
};
