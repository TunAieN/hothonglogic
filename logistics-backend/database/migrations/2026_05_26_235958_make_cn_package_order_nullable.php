<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The tracking-based workflow permits unmatched packages without an order.
     */
    public function up(): void
    {
        if (! Schema::hasTable('cn_packages') || ! Schema::hasColumn('cn_packages', 'order_id')) {
            return;
        }

        $isNullable = DB::table('information_schema.COLUMNS')
            ->where('TABLE_SCHEMA', DB::getDatabaseName())
            ->where('TABLE_NAME', 'cn_packages')
            ->where('COLUMN_NAME', 'order_id')
            ->value('IS_NULLABLE');

        if ($isNullable === 'YES') {
            return;
        }

        $foreignKey = DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', DB::getDatabaseName())
            ->where('TABLE_NAME', 'cn_packages')
            ->where('COLUMN_NAME', 'order_id')
            ->whereNotNull('REFERENCED_TABLE_NAME')
            ->value('CONSTRAINT_NAME');

        if ($foreignKey) {
            DB::statement(sprintf('ALTER TABLE cn_packages DROP FOREIGN KEY `%s`', $foreignKey));
        }

        DB::statement('ALTER TABLE cn_packages MODIFY order_id BIGINT UNSIGNED NULL');

        if ($foreignKey) {
            DB::statement(sprintf(
                'ALTER TABLE cn_packages ADD CONSTRAINT `%s` FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT',
                $foreignKey,
            ));
        }
    }

    /**
     * Intentionally non-destructive: existing unmatched packages require NULL.
     */
    public function down(): void {}
};
