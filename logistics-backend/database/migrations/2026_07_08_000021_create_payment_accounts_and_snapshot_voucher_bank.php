<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_accounts')) {
            Schema::create('payment_accounts', function (Blueprint $table) {
                $table->id();
                $table->string('bank_name', 100);
                $table->string('bank_code', 40)->nullable();
                $table->string('account_number', 80);
                $table->string('account_holder', 150);
                $table->string('branch_name', 150)->nullable();
                $table->boolean('is_default')->default(false)->index();
                $table->boolean('is_active')->default(true)->index();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('payment_vouchers')) {
            Schema::table('payment_vouchers', function (Blueprint $table) {
                if (! Schema::hasColumn('payment_vouchers', 'payment_account_id')) {
                    $table->foreignId('payment_account_id')->nullable()->after('payment_method_expected')->constrained('payment_accounts')->nullOnDelete();
                }
                if (! Schema::hasColumn('payment_vouchers', 'bank_name_snapshot')) {
                    $table->string('bank_name_snapshot', 100)->nullable()->after('payment_account_id');
                }
                if (! Schema::hasColumn('payment_vouchers', 'bank_code_snapshot')) {
                    $table->string('bank_code_snapshot', 40)->nullable()->after('bank_name_snapshot');
                }
                if (! Schema::hasColumn('payment_vouchers', 'bank_account_number_snapshot')) {
                    $table->string('bank_account_number_snapshot', 80)->nullable()->after('bank_code_snapshot');
                }
                if (! Schema::hasColumn('payment_vouchers', 'bank_account_holder_snapshot')) {
                    $table->string('bank_account_holder_snapshot', 150)->nullable()->after('bank_account_number_snapshot');
                }
                if (! Schema::hasColumn('payment_vouchers', 'bank_branch_name_snapshot')) {
                    $table->string('bank_branch_name_snapshot', 150)->nullable()->after('bank_account_holder_snapshot');
                }
                if (! Schema::hasColumn('payment_vouchers', 'transfer_content')) {
                    $table->string('transfer_content', 120)->nullable()->after('bank_branch_name_snapshot');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payment_vouchers')) {
            Schema::table('payment_vouchers', function (Blueprint $table) {
                if (Schema::hasColumn('payment_vouchers', 'payment_account_id')) {
                    $table->dropConstrainedForeignId('payment_account_id');
                }
                foreach ([
                    'bank_name_snapshot',
                    'bank_code_snapshot',
                    'bank_account_number_snapshot',
                    'bank_account_holder_snapshot',
                    'bank_branch_name_snapshot',
                    'transfer_content',
                ] as $column) {
                    if (Schema::hasColumn('payment_vouchers', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        Schema::dropIfExists('payment_accounts');
    }
};
