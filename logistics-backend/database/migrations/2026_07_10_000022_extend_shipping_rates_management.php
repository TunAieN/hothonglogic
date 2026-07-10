<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('shipping_rates')) {
            Schema::table('shipping_rates', function (Blueprint $table) {
                if (! Schema::hasColumn('shipping_rates', 'name')) {
                    $table->string('name', 150)->default('Bảng cước dành cho khách lẻ')->after('id');
                }
                if (! Schema::hasColumn('shipping_rates', 'customer_type')) {
                    $table->string('customer_type', 40)->nullable()->after('name');
                }
                if (! Schema::hasColumn('shipping_rates', 'route_type')) {
                    $table->string('route_type', 40)->nullable()->after('customer_type');
                }
                if (! Schema::hasColumn('shipping_rates', 'warehouse_id')) {
                    $table->unsignedBigInteger('warehouse_id')->nullable()->after('route_type');
                }
                if (! Schema::hasColumn('shipping_rates', 'effective_from')) {
                    $table->date('effective_from')->nullable()->after('warehouse_id');
                }
                if (! Schema::hasColumn('shipping_rates', 'effective_to')) {
                    $table->date('effective_to')->nullable()->after('effective_from');
                }
                if (! Schema::hasColumn('shipping_rates', 'status')) {
                    $table->string('status', 30)->default('active')->after('effective_to');
                }
                if (! Schema::hasColumn('shipping_rates', 'note')) {
                    $table->text('note')->nullable()->after('status');
                }
                if (! Schema::hasColumn('shipping_rates', 'created_by')) {
                    $table->unsignedBigInteger('created_by')->nullable()->after('note');
                }
            });
        }

        if (Schema::hasTable('shipping_rate_details')) {
            Schema::table('shipping_rate_details', function (Blueprint $table) {
                if (! Schema::hasColumn('shipping_rate_details', 'shipping_rate_id')) {
                    $table->unsignedBigInteger('shipping_rate_id')->nullable()->after('id');
                }
                if (! Schema::hasColumn('shipping_rate_details', 'min_weight')) {
                    $table->decimal('min_weight', 10, 3)->nullable()->after('rate_id');
                }
                if (! Schema::hasColumn('shipping_rate_details', 'max_weight')) {
                    $table->decimal('max_weight', 10, 3)->nullable()->after('min_weight');
                }
                if (! Schema::hasColumn('shipping_rate_details', 'price')) {
                    $table->decimal('price', 15, 2)->nullable()->after('price_per_kg');
                }
                if (! Schema::hasColumn('shipping_rate_details', 'price_type')) {
                    $table->string('price_type', 20)->default('per_kg')->after('price');
                }
                if (! Schema::hasColumn('shipping_rate_details', 'description')) {
                    $table->string('description', 255)->nullable()->after('price_type');
                }
                if (! Schema::hasColumn('shipping_rate_details', 'sort_order')) {
                    $table->unsignedInteger('sort_order')->default(0)->after('description');
                }
            });
        }

        if (Schema::hasTable('payment_voucher_packages')) {
            Schema::table('payment_voucher_packages', function (Blueprint $table) {
                if (! Schema::hasColumn('payment_voucher_packages', 'shipping_rate_id')) {
                    $table->unsignedBigInteger('shipping_rate_id')->nullable()->after('price_per_kg');
                }
                if (! Schema::hasColumn('payment_voucher_packages', 'shipping_rate_detail_id')) {
                    $table->unsignedBigInteger('shipping_rate_detail_id')->nullable()->after('shipping_rate_id');
                }
                if (! Schema::hasColumn('payment_voucher_packages', 'unit_price')) {
                    $table->decimal('unit_price', 15, 2)->default(0)->after('shipping_rate_detail_id');
                }
                if (! Schema::hasColumn('payment_voucher_packages', 'price_type')) {
                    $table->string('price_type', 20)->default('per_kg')->after('unit_price');
                }
                if (! Schema::hasColumn('payment_voucher_packages', 'rate_description')) {
                    $table->string('rate_description', 255)->nullable()->after('price_type');
                }
            });
        }
    }

    public function down(): void
    {
        // Non-destructive rollback: keep added columns to preserve voucher pricing snapshots.
    }
};
