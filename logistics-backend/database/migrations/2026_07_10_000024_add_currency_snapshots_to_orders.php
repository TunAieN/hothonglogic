<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('exchange_rates')) {
            Schema::create('exchange_rates', function (Blueprint $table) {
                $table->id();
                $table->string('from_currency', 3)->default('CNY');
                $table->string('to_currency', 3)->default('VND');
                $table->decimal('rate', 15, 4);
                $table->timestamp('effective_from')->nullable();
                $table->timestamp('effective_to')->nullable();
                $table->boolean('is_active')->default(true);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['from_currency', 'to_currency', 'is_active'], 'exchange_rates_pair_active_idx');
            });
        }

        if (Schema::hasTable('orders')) {
            Schema::table('orders', function (Blueprint $table) {
                if (! Schema::hasColumn('orders', 'exchange_rate')) {
                    $table->decimal('exchange_rate', 15, 4)->nullable()->after('total_amount');
                }
                if (! Schema::hasColumn('orders', 'product_total_cny')) {
                    $table->decimal('product_total_cny', 15, 2)->default(0)->after('exchange_rate');
                }
                if (! Schema::hasColumn('orders', 'product_total_vnd')) {
                    $table->decimal('product_total_vnd', 18, 0)->default(0)->after('product_total_cny');
                }
                if (! Schema::hasColumn('orders', 'currency')) {
                    $table->string('currency', 3)->default('CNY')->after('product_total_vnd');
                }
                if (! Schema::hasColumn('orders', 'exchange_rate_locked_at')) {
                    $table->timestamp('exchange_rate_locked_at')->nullable()->after('currency');
                }
            });
        }

        if (Schema::hasTable('order_items')) {
            Schema::table('order_items', function (Blueprint $table) {
                if (! Schema::hasColumn('order_items', 'exchange_rate')) {
                    $table->decimal('exchange_rate', 15, 4)->nullable()->after('price_cny');
                }
                if (! Schema::hasColumn('order_items', 'unit_price_vnd')) {
                    $table->decimal('unit_price_vnd', 18, 0)->default(0)->after('exchange_rate');
                }
                if (! Schema::hasColumn('order_items', 'subtotal_cny')) {
                    $table->decimal('subtotal_cny', 15, 2)->default(0)->after('quantity');
                }
                if (! Schema::hasColumn('order_items', 'subtotal_vnd')) {
                    $table->decimal('subtotal_vnd', 18, 0)->default(0)->after('subtotal_cny');
                }
            });
        }

        if (Schema::hasTable('orders') && Schema::hasColumn('orders', 'product_total_cny')) {
            DB::table('orders')->whereNull('currency')->update(['currency' => 'CNY']);
        }
    }

    public function down(): void
    {
        // Keep currency snapshots and exchange-rate history; do not drop financial data automatically.
    }
};
