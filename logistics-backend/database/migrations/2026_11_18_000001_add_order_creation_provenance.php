<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $connection = Schema::getConnection();

        if (! $connection->pretending() && (! Schema::hasTable('orders') || ! Schema::hasTable('customer_accounts'))) {
            throw new RuntimeException('orders and customer_accounts must exist before adding order provenance.');
        }

        if ($connection->getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE `orders` MODIFY `created_by` BIGINT UNSIGNED NULL COMMENT \'Employee who created the order; null for customer self-service\'');
        } else {
            Schema::table('orders', function (Blueprint $table) {
                $table->unsignedBigInteger('created_by')->nullable()->change();
            });
        }

        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'creation_source')) {
                $table->string('creation_source', 30)->default('legacy')->after('customer_id')->index();
            }
            if (! Schema::hasColumn('orders', 'submitted_by_customer_account_id')) {
                $table->foreignId('submitted_by_customer_account_id')->nullable()->after('creation_source')
                    ->constrained('customer_accounts')->restrictOnDelete();
            }
            if (! Schema::hasColumn('orders', 'submitted_at')) {
                $table->timestamp('submitted_at')->nullable()->after('submitted_by_customer_account_id');
            }
        });
    }

    public function down(): void
    {
        $hasCustomerSubmissions = Schema::hasColumn('orders', 'creation_source')
            && DB::table('orders')->where(function ($query) {
                $query->whereNull('created_by')->orWhere('creation_source', 'customer_portal');
            })->exists();

        if ($hasCustomerSubmissions) {
            throw new RuntimeException('Cannot remove order provenance while customer-created orders exist. Restore from backup or apply a reviewed forward migration.');
        }

        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'submitted_by_customer_account_id')) {
                $table->dropConstrainedForeignId('submitted_by_customer_account_id');
            }
            if (Schema::hasColumn('orders', 'submitted_at')) {
                $table->dropColumn('submitted_at');
            }
            if (Schema::hasColumn('orders', 'creation_source')) {
                $table->dropColumn('creation_source');
            }
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE `orders` MODIFY `created_by` BIGINT UNSIGNED NOT NULL COMMENT \'User who created the order\'');
        } else {
            Schema::table('orders', function (Blueprint $table) {
                $table->unsignedBigInteger('created_by')->nullable(false)->change();
            });
        }
    }
};
