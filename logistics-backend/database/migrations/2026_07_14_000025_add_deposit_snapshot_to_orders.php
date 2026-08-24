<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('orders')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'deposit_percent')) {
                $table->decimal('deposit_percent', 5, 2)->nullable()->after('exchange_rate_locked_at');
            }
            if (! Schema::hasColumn('orders', 'deposit_amount_vnd')) {
                $table->decimal('deposit_amount_vnd', 18, 0)->default(0)->after('deposit_percent');
            }
            if (! Schema::hasColumn('orders', 'deposit_paid_amount_vnd')) {
                $table->decimal('deposit_paid_amount_vnd', 18, 0)->default(0)->after('deposit_amount_vnd');
            }
            if (! Schema::hasColumn('orders', 'deposit_remaining_amount_vnd')) {
                $table->decimal('deposit_remaining_amount_vnd', 18, 0)->default(0)->after('deposit_paid_amount_vnd');
            }
            if (! Schema::hasColumn('orders', 'deposit_status')) {
                $table->string('deposit_status', 30)->nullable()->after('deposit_remaining_amount_vnd');
            }
            if (! Schema::hasColumn('orders', 'deposit_transfer_content')) {
                $table->string('deposit_transfer_content', 120)->nullable()->after('deposit_status');
            }
            if (! Schema::hasColumn('orders', 'deposit_requested_at')) {
                $table->timestamp('deposit_requested_at')->nullable()->after('deposit_transfer_content');
            }
            if (! Schema::hasColumn('orders', 'deposit_paid_at')) {
                $table->timestamp('deposit_paid_at')->nullable()->after('deposit_requested_at');
            }
            if (! Schema::hasColumn('orders', 'deposit_confirmed_by')) {
                $table->foreignId('deposit_confirmed_by')->nullable()->after('deposit_paid_at')->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('orders', 'deposit_manual_transaction_code')) {
                $table->string('deposit_manual_transaction_code', 100)->nullable()->after('deposit_confirmed_by');
            }
            if (! Schema::hasColumn('orders', 'deposit_note')) {
                $table->text('deposit_note')->nullable()->after('deposit_manual_transaction_code');
            }
        });
    }

    public function down(): void
    {
        // Keep deposit payment snapshots. Do not drop financial history automatically.
    }
};
