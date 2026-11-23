<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customer_payment_intents')) {
            Schema::create('customer_payment_intents', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
                $table->foreignId('payment_voucher_id')->nullable()->constrained('payment_vouchers')->restrictOnDelete();
                $table->foreignId('payment_account_id')->nullable()->constrained('payment_accounts')->restrictOnDelete();
                $table->foreignId('payment_transaction_id')->nullable()->constrained('payment_transactions')->nullOnDelete();
                $table->foreignId('ledger_id')->nullable()->constrained('customer_balance_ledgers')->nullOnDelete();
                $table->string('type', 30);
                $table->string('provider', 30)->default('sepay');
                $table->string('reference', 64)->unique();
                $table->unsignedBigInteger('amount_vnd');
                $table->string('idempotency_key', 100);
                $table->string('status', 30)->default('pending');
                $table->timestamp('expires_at');
                $table->timestamp('completed_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
                $table->unique(['customer_id', 'idempotency_key'], 'customer_payment_intents_customer_idem_unique');
                $table->index(['customer_id', 'status', 'created_at'], 'customer_payment_intents_customer_status_idx');
                $table->index(['payment_voucher_id', 'status'], 'customer_payment_intents_voucher_status_idx');
            });
        }

        if (! Schema::hasTable('sepay_webhook_events')) {
            Schema::create('sepay_webhook_events', function (Blueprint $table) {
                $table->id();
                $table->string('provider_transaction_id', 100)->unique();
                $table->foreignId('payment_intent_id')->nullable()->constrained('customer_payment_intents')->nullOnDelete();
                $table->string('payload_hash', 64);
                $table->string('transfer_type', 20)->nullable();
                $table->string('account_number', 100)->nullable();
                $table->unsignedBigInteger('amount_vnd')->nullable();
                $table->string('reference', 64)->nullable();
                $table->string('status', 30)->default('received');
                $table->string('reconciliation_reason', 100)->nullable();
                $table->timestamp('occurred_at')->nullable();
                $table->timestamp('processed_at')->nullable();
                $table->json('payload');
                $table->timestamps();
                $table->index(['status', 'created_at']);
                $table->index('reference');
            });
        }
    }

    public function down(): void
    {
        // Deliberately non-destructive for financial records.
    }
};
