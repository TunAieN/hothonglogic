<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_purchase_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('submitted_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('kind', 20)->default('draft');
            $table->string('status', 20)->default('draft');
            $table->string('title', 150)->nullable();
            $table->text('note')->nullable();
            $table->uuid('idempotency_key')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
            $table->index(['customer_id', 'kind', 'status'], 'customer_drafts_scope_idx');
            $table->unique(['customer_id', 'idempotency_key'], 'customer_drafts_idempotency_unique');
        });

        Schema::create('customer_purchase_draft_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_purchase_draft_id')->constrained('customer_purchase_drafts')->cascadeOnDelete();
            $table->string('source', 30)->nullable();
            $table->text('product_link')->nullable();
            $table->string('product_name', 255);
            $table->string('variant', 255)->nullable();
            $table->decimal('price_cny', 10, 2)->nullable();
            $table->unsignedInteger('quantity')->default(1);
            $table->text('note')->nullable();
            $table->text('product_image')->nullable();
            $table->string('seller')->nullable();
            $table->string('shop_id', 100)->nullable();
            $table->string('shop_name')->nullable();
            $table->string('size')->nullable();
            $table->string('color')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_purchase_draft_items');
        Schema::dropIfExists('customer_purchase_drafts');
    }
};
