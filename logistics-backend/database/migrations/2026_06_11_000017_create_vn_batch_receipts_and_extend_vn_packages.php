<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('vn_batch_receipts')) {
            Schema::create('vn_batch_receipts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('cn_batch_id')->constrained('cn_batches')->cascadeOnDelete();
                $table->foreignId('vn_warehouse_id')->nullable()->constrained('vn_warehouses')->nullOnDelete();
                $table->string('batch_code');
                $table->decimal('actual_batch_weight', 10, 2)->nullable();
                $table->decimal('package_material_weight', 10, 2)->nullable();
                $table->decimal('actual_length', 10, 2)->nullable();
                $table->decimal('actual_width', 10, 2)->nullable();
                $table->decimal('actual_height', 10, 2)->nullable();
                $table->decimal('actual_volume', 10, 2)->nullable();
                $table->decimal('wooden_fee', 10, 2)->default(0);
                $table->decimal('other_fee', 10, 2)->default(0);
                $table->enum('status', ['draft', 'checking', 'matched', 'mismatched', 'confirmed', 'cancelled'])->default('draft');
                $table->unsignedInteger('total_expected_packages')->default(0);
                $table->unsignedInteger('total_received_packages')->default(0);
                $table->unsignedInteger('total_inspected_packages')->default(0);
                $table->unsignedInteger('total_missing_packages')->default(0);
                $table->unsignedInteger('total_extra_packages')->default(0);
                $table->unsignedInteger('total_damaged_packages')->default(0);
                $table->text('note')->nullable();
                $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('confirmed_at')->nullable();
                $table->timestamps();

                $table->unique('cn_batch_id');
                $table->index('batch_code');
            });
        }

        if (! Schema::hasTable('vn_packages')) {
            return;
        }

        Schema::table('vn_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('vn_packages', 'vn_batch_receipt_id')) {
                $table->foreignId('vn_batch_receipt_id')->nullable()->after('id');
            }

            if (! Schema::hasColumn('vn_packages', 'tracking_number_snapshot')) {
                $table->string('tracking_number_snapshot')->nullable()->after('cn_package_id');
            }

            if (! Schema::hasColumn('vn_packages', 'actual_length')) {
                $table->decimal('actual_length', 10, 2)->nullable()->after('actual_weight');
            }

            if (! Schema::hasColumn('vn_packages', 'actual_width')) {
                $table->decimal('actual_width', 10, 2)->nullable()->after('actual_length');
            }

            if (! Schema::hasColumn('vn_packages', 'actual_height')) {
                $table->decimal('actual_height', 10, 2)->nullable()->after('actual_width');
            }

            if (! Schema::hasColumn('vn_packages', 'extra_fee')) {
                $table->decimal('extra_fee', 10, 2)->default(0)->after('actual_volume');
            }

            if (! Schema::hasColumn('vn_packages', 'wooden_fee')) {
                $table->decimal('wooden_fee', 10, 2)->default(0)->after('extra_fee');
            }

            if (! Schema::hasColumn('vn_packages', 'other_fee')) {
                $table->decimal('other_fee', 10, 2)->default(0)->after('wooden_fee');
            }

            if (! Schema::hasColumn('vn_packages', 'order_code_snapshot')) {
                $table->string('order_code_snapshot')->nullable()->after('other_fee');
            }

            if (! Schema::hasColumn('vn_packages', 'customer_name_snapshot')) {
                $table->string('customer_name_snapshot')->nullable()->after('order_code_snapshot');
            }

            if (! Schema::hasColumn('vn_packages', 'handled_by')) {
                $table->foreignId('handled_by')->nullable()->after('note');
            }

            if (! Schema::hasColumn('vn_packages', 'scanned_at')) {
                $table->timestamp('scanned_at')->nullable()->after('handled_by');
            }
        });

        $this->modifyColumnIfExists('vn_packages', 'cn_batch_id', 'BIGINT UNSIGNED NULL');
        $this->modifyColumnIfExists('vn_packages', 'cn_package_id', 'BIGINT UNSIGNED NULL');
        $this->modifyColumnIfExists('vn_packages', 'actual_weight', 'DECIMAL(10,2) NULL');
        $this->modifyColumnIfExists('vn_packages', 'actual_volume', 'DECIMAL(10,2) NULL');
        $this->modifyColumnIfExists('vn_packages', 'received_at', 'TIMESTAMP NULL');

        if (Schema::hasColumn('vn_packages', 'inspection_status')) {
            DB::statement("ALTER TABLE vn_packages MODIFY inspection_status ENUM('pending','inspected','damaged','missing','extra','mismatched') NOT NULL DEFAULT 'pending'");
        }

        Schema::table('vn_packages', function (Blueprint $table) {
            if (Schema::hasColumn('vn_packages', 'vn_batch_receipt_id') && ! $this->indexExists('vn_packages', 'vn_packages_receipt_index')) {
                $table->index('vn_batch_receipt_id', 'vn_packages_receipt_index');
            }

            if (Schema::hasColumn('vn_packages', 'tracking_number_snapshot') && ! $this->indexExists('vn_packages', 'vn_packages_tracking_snapshot_index')) {
                $table->index('tracking_number_snapshot', 'vn_packages_tracking_snapshot_index');
            }

            if (Schema::hasColumn('vn_packages', 'vn_batch_receipt_id')
                && Schema::hasColumn('vn_packages', 'tracking_number_snapshot')
                && ! $this->indexExists('vn_packages', 'vn_packages_receipt_tracking_unique')) {
                $table->unique(['vn_batch_receipt_id', 'tracking_number_snapshot'], 'vn_packages_receipt_tracking_unique');
            }
        });

        if (Schema::hasColumn('vn_packages', 'vn_batch_receipt_id') && ! $this->foreignKeyExists('vn_packages', 'vn_packages_receipt_foreign')) {
            DB::statement('ALTER TABLE vn_packages ADD CONSTRAINT vn_packages_receipt_foreign FOREIGN KEY (vn_batch_receipt_id) REFERENCES vn_batch_receipts(id) ON DELETE SET NULL');
        }

        if (Schema::hasColumn('vn_packages', 'handled_by') && ! $this->foreignKeyExists('vn_packages', 'vn_packages_handled_by_foreign')) {
            DB::statement('ALTER TABLE vn_packages ADD CONSTRAINT vn_packages_handled_by_foreign FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('vn_packages')) {
            $hasReceiptId = Schema::hasColumn('vn_packages', 'vn_batch_receipt_id');
            $hasReceiptUnique = $this->indexExists('vn_packages', 'vn_packages_receipt_tracking_unique');
            $hasReceiptIndex = $this->indexExists('vn_packages', 'vn_packages_receipt_index');
            $hasTrackingIndex = $this->indexExists('vn_packages', 'vn_packages_tracking_snapshot_index');
            $hasReceiptForeign = $this->foreignKeyExists('vn_packages', 'vn_packages_receipt_foreign');

            Schema::table('vn_packages', function (Blueprint $table) use ($hasReceiptId, $hasReceiptUnique, $hasReceiptIndex, $hasTrackingIndex, $hasReceiptForeign) {
                if ($hasReceiptForeign) {
                    $table->dropForeign('vn_packages_receipt_foreign');
                }

                if ($hasReceiptUnique) {
                    $table->dropUnique('vn_packages_receipt_tracking_unique');
                }

                if ($hasReceiptIndex) {
                    $table->dropIndex('vn_packages_receipt_index');
                }

                if ($hasTrackingIndex) {
                    $table->dropIndex('vn_packages_tracking_snapshot_index');
                }

                if ($hasReceiptId) {
                    $table->dropColumn('vn_batch_receipt_id');
                }
            });
        }

        if (Schema::hasTable('vn_batch_receipts')) {
            Schema::drop('vn_batch_receipts');
        }
    }

    private function modifyColumnIfExists(string $table, string $column, string $definition): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
            return;
        }

        DB::statement(sprintf('ALTER TABLE %s MODIFY %s %s', $table, $column, $definition));
    }

    private function indexExists(string $table, string $index): bool
    {
        return DB::table('information_schema.statistics')
            ->where('table_schema', DB::connection()->getDatabaseName())
            ->where('table_name', $table)
            ->where('index_name', $index)
            ->exists();
    }

    private function foreignKeyExists(string $table, string $constraint): bool
    {
        return DB::table('information_schema.table_constraints')
            ->where('constraint_schema', DB::connection()->getDatabaseName())
            ->where('table_name', $table)
            ->where('constraint_name', $constraint)
            ->where('constraint_type', 'FOREIGN KEY')
            ->exists();
    }
};
