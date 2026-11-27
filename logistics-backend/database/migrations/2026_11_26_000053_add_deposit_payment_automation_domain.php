<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_transactions', function (Blueprint $table) {
            if (! Schema::hasColumn('payment_transactions', 'confirmation_source')) {
                $table->string('confirmation_source', 40)->nullable()->after('confirmed_by');
            }
            if (! Schema::hasColumn('payment_transactions', 'provider')) {
                $table->string('provider', 40)->nullable()->after('confirmation_source');
            }
            if (! Schema::hasColumn('payment_transactions', 'provider_transaction_id')) {
                $table->string('provider_transaction_id', 100)->nullable()->after('provider');
            }
            if (! Schema::hasColumn('payment_transactions', 'verification_details')) {
                $table->json('verification_details')->nullable()->after('provider_transaction_id');
            }
        });

        if (! Schema::hasIndex('payment_transactions', 'payment_transactions_provider_tx_unique')) {
            Schema::table('payment_transactions', function (Blueprint $table) {
                $table->unique(['provider', 'provider_transaction_id'], 'payment_transactions_provider_tx_unique');
            });
        }

        if (! Schema::hasTable('customer_notifications')) {
            Schema::create('customer_notifications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
                $table->foreignId('order_id')->nullable()->constrained('orders')->restrictOnDelete();
                $table->foreignId('payment_voucher_id')->nullable()->constrained('payment_vouchers')->restrictOnDelete();
                $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('type', 50);
                $table->string('channel', 30)->default('in_app');
                $table->string('status', 30)->default('sent');
                $table->string('title', 180);
                $table->text('body');
                $table->string('action_url', 500)->nullable();
                $table->string('idempotency_key', 160)->unique();
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('read_at')->nullable();
                $table->string('failure_code', 100)->nullable();
                $table->text('failure_message')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
                $table->index(['customer_id', 'read_at', 'created_at'], 'customer_notifications_customer_unread_idx');
                $table->index(['payment_voucher_id', 'type', 'created_at'], 'customer_notifications_voucher_type_idx');
            });
        }
    }

    public function down(): void
    {
        // Financial confirmation and notification history is deliberately retained.
    }
};
