<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reconcile order-item columns that predate the Laravel migration history.
     */
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            if (! Schema::hasColumn('order_items', 'order_id')) {
                $table->foreignId('order_id')->nullable()->after('id')->constrained('orders')->cascadeOnDelete();
            }

            if (! Schema::hasColumn('order_items', 'product_name')) {
                $table->string('product_name')->nullable()->after('order_id');
            }

            if (! Schema::hasColumn('order_items', 'product_link')) {
                $table->text('product_link')->nullable()->after('product_name');
            }

            if (! Schema::hasColumn('order_items', 'price_cny')) {
                $table->decimal('price_cny', 10, 2)->default(0)->after('product_link');
            }

            if (! Schema::hasColumn('order_items', 'quantity')) {
                $table->unsignedInteger('quantity')->default(1)->after('price_cny');
            }

            if (! Schema::hasColumn('order_items', 'note')) {
                $table->text('note')->nullable()->after('quantity');
            }

            if (! Schema::hasColumn('order_items', 'product_image')) {
                $table->text('product_image')->nullable()->after('note');
            }
        });
    }

    /**
     * Intentionally non-destructive: these columns may predate this migration.
     */
    public function down(): void {}
};
