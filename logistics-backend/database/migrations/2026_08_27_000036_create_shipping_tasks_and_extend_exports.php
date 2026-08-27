<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shipping_tasks')) {
            Schema::create('shipping_tasks', function (Blueprint $table) {
                $table->id();
                $table->string('task_code', 50)->unique();
                $table->foreignId('delivery_staff_id')->constrained('users')->restrictOnDelete();
                $table->foreignId('vn_warehouse_id')->constrained('vn_warehouses')->restrictOnDelete();
                $table->string('carrier_code', 50);
                $table->string('carrier_name', 100);
                $table->date('scheduled_delivery_date');
                $table->string('service_type', 30)->nullable();
                $table->string('delivery_method', 30)->nullable();
                $table->string('status', 30)->default('created');
                $table->string('note', 250)->nullable();
                $table->text('transport_note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['status', 'created_at']);
                $table->index('scheduled_delivery_date');
            });
        }

        if (! Schema::hasTable('shipping_task_orders')) {
            Schema::create('shipping_task_orders', function (Blueprint $table) {
                $table->id();
                $table->foreignId('shipping_task_id')->constrained('shipping_tasks')->cascadeOnDelete();
                $table->foreignId('order_id')->constrained('orders')->restrictOnDelete();
                $table->unsignedInteger('package_count')->default(0);
                $table->decimal('total_weight', 12, 3)->default(0);
                $table->decimal('total_value', 18, 0)->default(0);
                $table->timestamps();

                $table->unique(['shipping_task_id', 'order_id'], 'shipping_task_order_unique');
                $table->index('order_id');
            });
        }

        if (! Schema::hasTable('exports')) {
            Schema::create('exports', function (Blueprint $table) {
                $table->id();
                $table->string('export_code', 50)->unique();
                $table->unsignedBigInteger('shipping_task_id')->nullable();
                $table->unique('shipping_task_id', 'exports_shipping_task_unique');
                $table->foreign('shipping_task_id', 'exports_shipping_task_foreign')
                    ->references('id')->on('shipping_tasks')->cascadeOnDelete();
                $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->text('delivery_address')->nullable();
                $table->foreignId('delivery_staff_id')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->foreign('created_by', 'exports_created_by_foreign')
                    ->references('id')->on('users')->nullOnDelete();
                $table->date('scheduled_delivery_date')->nullable();
                $table->string('status', 30)->default('pending');
                $table->text('note')->nullable();
                $table->timestamps();
            });
        } else {
            $this->makeLegacyExportColumnsNullable();

            Schema::table('exports', function (Blueprint $table) {
                if (! Schema::hasColumn('exports', 'shipping_task_id')) {
                    $table->foreignId('shipping_task_id')->nullable()->after('export_code');
                    $table->unique('shipping_task_id', 'exports_shipping_task_unique');
                    $table->foreign('shipping_task_id', 'exports_shipping_task_foreign')
                        ->references('id')->on('shipping_tasks')->cascadeOnDelete();
                }
                if (! Schema::hasColumn('exports', 'created_by')) {
                    $table->foreignId('created_by')->nullable()->after('delivery_staff_id');
                    $table->foreign('created_by', 'exports_created_by_foreign')
                        ->references('id')->on('users')->nullOnDelete();
                }
                if (! Schema::hasColumn('exports', 'scheduled_delivery_date')) {
                    $table->date('scheduled_delivery_date')->nullable()->after('created_by');
                }
            });
        }

        if (! Schema::hasTable('export_items')) {
            Schema::create('export_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('export_id')->constrained('exports')->cascadeOnDelete();
                $table->foreignId('vn_package_id')->unique()->constrained('vn_packages')->restrictOnDelete();
                $table->timestamps();
            });
        } else {
            $duplicates = DB::table('export_items')
                ->select('vn_package_id')
                ->groupBy('vn_package_id')
                ->havingRaw('COUNT(*) > 1')
                ->exists();

            if (! $duplicates && ! $this->hasIndex('export_items', 'export_items_vn_package_unique')) {
                Schema::table('export_items', function (Blueprint $table) {
                    $table->unique('vn_package_id', 'export_items_vn_package_unique');
                });
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('exports')) {
            Schema::table('exports', function (Blueprint $table) {
                if (Schema::hasColumn('exports', 'shipping_task_id')) {
                    $table->dropForeign('exports_shipping_task_foreign');
                    $table->dropUnique('exports_shipping_task_unique');
                    $table->dropColumn('shipping_task_id');
                }
                if (Schema::hasColumn('exports', 'created_by')) {
                    $table->dropForeign('exports_created_by_foreign');
                    $table->dropColumn('created_by');
                }
                if (Schema::hasColumn('exports', 'scheduled_delivery_date')) {
                    $table->dropColumn('scheduled_delivery_date');
                }
            });
        }

        Schema::dropIfExists('shipping_task_orders');
        Schema::dropIfExists('shipping_tasks');
    }

    private function makeLegacyExportColumnsNullable(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        if (Schema::hasColumn('exports', 'invoice_id')) {
            DB::statement('ALTER TABLE exports MODIFY invoice_id BIGINT UNSIGNED NULL');
        }
        if (Schema::hasColumn('exports', 'customer_id')) {
            DB::statement('ALTER TABLE exports MODIFY customer_id BIGINT UNSIGNED NULL');
        }
        if (Schema::hasColumn('exports', 'delivery_address')) {
            DB::statement('ALTER TABLE exports MODIFY delivery_address TEXT NULL');
        }
    }

    private function hasIndex(string $table, string $index): bool
    {
        if (DB::getDriverName() !== 'mysql') {
            return false;
        }

        return count(DB::select("SHOW INDEX FROM {$table} WHERE Key_name = ?", [$index])) > 0;
    }
};
